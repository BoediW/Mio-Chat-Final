import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// Discord Bot Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.Message, Partials.Channel],
});

// WebSocket Server for real-time communication
const wss = new WebSocketServer({ port: 8080 });

// Store connected WebSocket clients
const wsClients = new Set();

wss.on('connection', (ws) => {
    console.log('🌐 Dashboard connected');
    wsClients.add(ws);

    // Send initial data when dashboard connects
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);

            if (message.type === 'GET_GUILDS') {
                const guilds = client.guilds.cache.map(guild => ({
                    id: guild.id,
                    name: guild.name,
                    icon: guild.iconURL({ dynamic: true, size: 64 }),
                    memberCount: guild.memberCount,
                }));
                ws.send(JSON.stringify({ type: 'GUILDS', data: guilds }));
            }

            if (message.type === 'GET_CHANNELS') {
                const guild = client.guilds.cache.get(message.guildId);
                if (guild) {
                    const textChannels = guild.channels.cache
                        .filter(ch => ch.type === 0) // Text channels only
                        .map(ch => ({
                            id: ch.id,
                            name: ch.name,
                            type: 'text',
                            position: ch.position,
                            parentId: ch.parentId,
                            parentName: ch.parent?.name || null,
                        }));

                    const voiceChannels = guild.channels.cache
                        .filter(ch => ch.type === 2) // Voice channels
                        .map(ch => ({
                            id: ch.id,
                            name: ch.name,
                            type: 'voice',
                            position: ch.position,
                            parentId: ch.parentId,
                            parentName: ch.parent?.name || null,
                        }));

                    const categories = guild.channels.cache
                        .filter(ch => ch.type === 4) // Categories
                        .map(cat => ({
                            id: cat.id,
                            name: cat.name,
                            position: cat.position,
                        }))
                        .sort((a, b) => a.position - b.position);

                    const channels = [...textChannels, ...voiceChannels].sort((a, b) => a.position - b.position);
                    ws.send(JSON.stringify({ type: 'CHANNELS', data: channels, categories }));
                }
            }

            if (message.type === 'GET_ROLES') {
                const guild = client.guilds.cache.get(message.guildId);
                if (guild) {
                    const roles = guild.roles.cache
                        .filter(role => role.name !== '@everyone')
                        .map(role => ({
                            id: role.id,
                            name: role.name,
                            color: role.hexColor,
                            mentionable: role.mentionable,
                            position: role.position,
                        }))
                        .sort((a, b) => b.position - a.position);

                    ws.send(JSON.stringify({ type: 'ROLES', data: roles }));
                }
            }

            if (message.type === 'GET_MESSAGES') {
                const channel = client.channels.cache.get(message.channelId);
                if (channel && channel.isTextBased()) {
                    const messages = await channel.messages.fetch({ limit: 50 });
                    const formattedMessages = messages.map(msg => formatMessage(msg)).reverse();
                    ws.send(JSON.stringify({ type: 'MESSAGES', data: formattedMessages, channelId: message.channelId }));
                }
            }

            if (message.type === 'SEND_MESSAGE') {
                console.log('📤 Attempting to send message to channel:', message.channelId);
                console.log('📝 Message content:', message.content);

                let targetChannel = client.channels.cache.get(message.channelId);
                if (!targetChannel) {
                    console.log('❌ Channel not found in cache, trying to fetch...');
                    try {
                        targetChannel = await client.channels.fetch(message.channelId);
                        if (!targetChannel) {
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Channel not found' }));
                            return;
                        }
                    } catch (fetchErr) {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'Channel not found' }));
                        return;
                    }
                }

                if (!targetChannel.isTextBased()) {
                    console.log('❌ Channel is not text-based');
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Channel is not text-based' }));
                    return;
                }

                // Check bot permissions in the channel
                const guild = targetChannel.guild;
                if (guild) {
                    const botMember = guild.members.cache.get(client.user.id);
                    const permissions = targetChannel.permissionsFor(botMember);

                    if (!permissions?.has('SendMessages')) {
                        console.log('❌ Bot does not have SendMessages permission in this channel');
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'Bot tidak punya permission untuk mengirim pesan di channel ini. Invite ulang bot dengan permission Administrator.' }));
                        return;
                    }
                }

                try {
                    const messageOptions = {
                        content: message.content || undefined,
                        allowedMentions: {
                            parse: ['users', 'roles', 'everyone'],
                            repliedUser: true,
                        },
                    };

                    // Add files/attachments if provided (URLs)
                    if (message.attachments && message.attachments.length > 0) {
                        messageOptions.files = message.attachments;
                    }

                    // Handle image data from dashboard (base64)
                    if (message.imageData) {
                        console.log('🖼️ Processing image attachment:', message.imageName);
                        const base64Data = message.imageData.split(',')[1];
                        const buffer = Buffer.from(base64Data, 'base64');
                        messageOptions.files = [{
                            attachment: buffer,
                            name: message.imageName || 'image.png'
                        }];
                    }

                    // Add embed if provided
                    if (message.embed) {
                        messageOptions.embeds = [message.embed];
                    }

                    // Add stickers if provided
                    if (message.stickers && message.stickers.length > 0) {
                        messageOptions.stickers = message.stickers;
                    }

                    const sentMessage = await targetChannel.send(messageOptions);
                    console.log('✅ Message sent successfully, ID:', sentMessage.id);
                    ws.send(JSON.stringify({ type: 'MESSAGE_SENT', success: true, messageId: sentMessage.id }));
                } catch (sendError) {
                    console.error('❌ Failed to send message:', sendError.message);
                    console.error('Full error:', sendError);
                    ws.send(JSON.stringify({ type: 'ERROR', message: `Failed to send: ${sendError.message}` }));
                }
            }

            if (message.type === 'GET_EMOJIS') {
                const guild = client.guilds.cache.get(message.guildId);
                if (guild) {
                    const customEmojis = guild.emojis.cache.map(emoji => ({
                        id: emoji.id,
                        name: emoji.name,
                        animated: emoji.animated,
                        url: emoji.url,
                        identifier: `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`,
                    }));
                    ws.send(JSON.stringify({ type: 'EMOJIS', data: customEmojis }));
                }
            }

            if (message.type === 'GET_MEMBERS') {
                const guild = client.guilds.cache.get(message.guildId);
                if (guild) {
                    await guild.members.fetch(); // Fetch all members
                    const members = guild.members.cache
                        .filter(m => !m.user.bot)
                        .map(member => ({
                            id: member.id,
                            username: member.user.username,
                            displayName: member.displayName,
                            avatar: member.displayAvatarURL({ dynamic: true, size: 64 }),
                            status: member.presence?.status || 'offline',
                            roles: member.roles.cache
                                .filter(r => r.name !== '@everyone')
                                .map(r => ({ id: r.id, name: r.name, color: r.hexColor })),
                        }));

                    const bots = guild.members.cache
                        .filter(m => m.user.bot)
                        .map(member => ({
                            id: member.id,
                            username: member.user.username,
                            displayName: member.displayName,
                            avatar: member.displayAvatarURL({ dynamic: true, size: 64 }),
                            status: member.presence?.status || 'offline',
                            bot: true,
                        }));

                    ws.send(JSON.stringify({ type: 'MEMBERS', data: { members, bots } }));
                }
            }

            if (message.type === 'TYPING_START') {
                const channel = client.channels.cache.get(message.channelId);
                if (channel && channel.isTextBased()) {
                    await channel.sendTyping();
                }
            }

            if (message.type === 'GET_BOT_INFO') {
                if (!client.user) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Bot belum siap, tunggu sebentar...' }));
                    return;
                }
                ws.send(JSON.stringify({
                    type: 'BOT_INFO',
                    data: {
                        id: client.user.id,
                        username: client.user.username,
                        displayName: client.user.displayName || client.user.username,
                        avatar: client.user.displayAvatarURL({ dynamic: true, size: 128 }),
                        tag: client.user.tag,
                    }
                }));
            }

        } catch (err) {
            console.error('WebSocket message error:', err);
            ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
        }
    });

    ws.on('close', () => {
        console.log('🔌 Dashboard disconnected');
        wsClients.delete(ws);
    });
});

// Format message for dashboard
function formatMessage(msg) {
    return {
        id: msg.id,
        content: msg.content,
        author: {
            id: msg.author.id,
            username: msg.author.username,
            displayName: msg.author.displayName || msg.author.username,
            avatar: msg.author.displayAvatarURL({ dynamic: true, size: 64 }),
            bot: msg.author.bot,
        },
        timestamp: msg.createdTimestamp,
        attachments: msg.attachments.map(att => ({
            url: att.url,
            name: att.name,
            contentType: att.contentType,
            width: att.width,
            height: att.height,
        })),
        embeds: msg.embeds.map(embed => ({
            title: embed.title,
            description: embed.description,
            color: embed.color,
            url: embed.url,
            image: embed.image?.url,
            thumbnail: embed.thumbnail?.url,
            author: embed.author,
            fields: embed.fields,
        })),
        stickers: msg.stickers?.map(s => ({
            name: s.name,
            url: s.url,
        })) || [],
        reactions: msg.reactions?.cache.map(r => ({
            emoji: r.emoji.toString(),
            count: r.count,
        })) || [],
        mentions: {
            everyone: msg.mentions.everyone,
            roles: msg.mentions.roles.map(r => ({ id: r.id, name: r.name })),
            users: msg.mentions.users.map(u => ({ id: u.id, username: u.username })),
        },
        channelId: msg.channelId,
        guildId: msg.guildId,
        replyTo: msg.reference?.messageId || null,
    };
}

// Broadcast message to all connected dashboards
function broadcast(data) {
    const jsonData = JSON.stringify(data);
    wsClients.forEach(ws => {
        if (ws.readyState === 1) { // OPEN
            ws.send(jsonData);
        }
    });
}

// Bot Events
client.once('ready', () => {
    console.log(`✅ Mio Bot logged in as ${client.user.tag}`);
    console.log(`📡 WebSocket server running on port 8080`);
    console.log(`🏠 Serving ${client.guilds.cache.size} guild(s)`);
    console.log(`🎵 Mio Auto Chat Dashboard Ready!`);
});

// Real-time message handler
client.on('messageCreate', (message) => {
    broadcast({
        type: 'NEW_MESSAGE',
        data: formatMessage(message),
    });
});

// Message delete handler
client.on('messageDelete', (message) => {
    broadcast({
        type: 'MESSAGE_DELETED',
        data: { id: message.id, channelId: message.channelId },
    });
});

// Message update handler
client.on('messageUpdate', (oldMessage, newMessage) => {
    if (newMessage.partial) return;
    broadcast({
        type: 'MESSAGE_UPDATED',
        data: formatMessage(newMessage),
    });
});

// Typing indicator
client.on('typingStart', (typing) => {
    broadcast({
        type: 'TYPING',
        data: {
            channelId: typing.channel.id,
            userId: typing.user.id,
            username: typing.user.username,
        },
    });
});

// Presence update
client.on('presenceUpdate', (oldPresence, newPresence) => {
    if (newPresence.user) {
        broadcast({
            type: 'PRESENCE_UPDATE',
            data: {
                userId: newPresence.user.id,
                status: newPresence.status,
            },
        });
    }
});

// Error handling
client.on('error', (error) => {
    console.error('❌ Client error:', error.message);
});

wss.on('error', (error) => {
    console.error('❌ WebSocket server error:', error.message);
});

// Login bot
console.log('🔄 Attempting to login...');
console.log('📝 Token (first 20 chars):', process.env.DISCORD_TOKEN?.substring(0, 20) + '...');

client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('✅ Login successful!'))
    .catch((error) => {
        console.error('❌ Login failed:', error.message);
        console.error('💡 Make sure your token is valid and the bot has proper permissions');
        process.exit(1);
    });
