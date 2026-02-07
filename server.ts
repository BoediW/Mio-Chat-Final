import express from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { Client, GatewayIntentBits, Partials, ChannelType, TextChannel, Message, Attachment } from 'discord.js';
import dotenv from 'dotenv';
// @ts-ignore
import { handler as ssrHandler } from './dist/server/entry.mjs';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Discord Bot Configuration
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

// WebSocket Server attached to the same HTTP server
const wss = new WebSocketServer({ server: httpServer });
const wsClients = new Set<WebSocket>();

// ... Logic from bot/index.js adapted for this server ...

wss.on('connection', (ws) => {
    console.log('🌐 Dashboard connected');
    wsClients.add(ws);

    ws.on('message', async (data: string) => {
        try {
            const message = JSON.parse(data);
            console.log('📩 Received message type:', message.type);

            if (message.type === 'GET_GUILDS') {
                console.log('🔍 Fetching guilds. Cache size:', client.guilds.cache.size);

                if (client.guilds.cache.size === 0) {
                    console.log('⚠️ Cache empty, forcing fetch...');
                    try {
                        await client.guilds.fetch();
                    } catch (e) {
                        console.error('❌ Failed to fetch guilds:', e);
                    }
                }

                const guilds = client.guilds.cache.map(guild => ({
                    id: guild.id,
                    name: guild.name,
                    icon: guild.iconURL({ forceStatic: false, size: 64 }),
                    memberCount: guild.memberCount,
                }));
                console.log(`📤 Sending ${guilds.length} guilds to dashboard`);
                ws.send(JSON.stringify({ type: 'GUILDS', data: guilds }));
            }

            if (message.type === 'GET_CHANNELS') {
                console.log('🔍 Fetching channels for guild:', message.guildId);
                const guild = client.guilds.cache.get(message.guildId);
                if (!guild) {
                    console.log('❌ Guild not found in cache:', message.guildId);
                } else {
                    console.log('✅ Guild found:', guild.name);
                    if (guild.channels.cache.size === 0) {
                        console.log('⚠️ Channel cache empty, fetching...');
                        try {
                            await guild.channels.fetch();
                        } catch (e) {
                            console.error('❌ Failed to fetch channels:', e);
                        }
                    }
                }
                if (guild) {
                    const textChannels = guild.channels.cache
                        .filter(ch => ch.type === ChannelType.GuildText)
                        .map(ch => ({
                            id: ch.id,
                            name: ch.name,
                            type: 'text',
                            // @ts-ignore
                            position: ch.position,
                            parentId: ch.parentId,
                            parentName: ch.parent?.name || null,
                        }));
                    const voiceChannels = guild.channels.cache
                        .filter(ch => ch.type === ChannelType.GuildVoice)
                        .map(ch => ({
                            id: ch.id,
                            name: ch.name,
                            type: 'voice',
                            // @ts-ignore
                            position: ch.position,
                            parentId: ch.parentId,
                            parentName: ch.parent?.name || null,
                        }));
                    const categories = guild.channels.cache
                        .filter(ch => ch.type === ChannelType.GuildCategory)
                        // @ts-ignore
                        .map(cat => ({ id: cat.id, name: cat.name, position: cat.position }))
                        .sort((a, b) => a.position - b.position);

                    // @ts-ignore
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
                const channel = client.channels.cache.get(message.channelId) as TextChannel;
                if (channel && channel.isTextBased()) {
                    const messages = await channel.messages.fetch({ limit: 50 });
                    const formattedMessages = messages.map(msg => formatMessage(msg)).reverse();
                    ws.send(JSON.stringify({ type: 'MESSAGES', data: formattedMessages, channelId: message.channelId }));
                }
            }

            if (message.type === 'SEND_MESSAGE') {
                let targetChannel = client.channels.cache.get(message.channelId) as TextChannel;
                if (!targetChannel) {
                    try {
                        targetChannel = await client.channels.fetch(message.channelId) as TextChannel;
                    } catch (e) { }
                }

                if (targetChannel && targetChannel.isTextBased()) {
                    const messageOptions: any = {
                        content: message.content || undefined,
                        allowedMentions: { parse: ['users', 'roles', 'everyone'], repliedUser: true },
                    };

                    if (message.imageData) {
                        const base64Data = message.imageData.split(',')[1];
                        const buffer = Buffer.from(base64Data, 'base64');
                        messageOptions.files = [{ attachment: buffer, name: message.imageName || 'image.png' }];
                    }

                    try {
                        const sentMessage = await targetChannel.send(messageOptions);
                        ws.send(JSON.stringify({ type: 'MESSAGE_SENT', success: true, messageId: sentMessage.id }));
                    } catch (err: any) {
                        ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
                    }
                }
            }

            if (message.type === 'GET_BOT_INFO') {
                if (client.user) {
                    ws.send(JSON.stringify({
                        type: 'BOT_INFO',
                        data: {
                            id: client.user.id,
                            username: client.user.username,
                            avatar: client.user.displayAvatarURL({ forceStatic: false, size: 128 }),
                        }
                    }));
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
                            avatar: member.displayAvatarURL({ forceStatic: false, size: 64 }),
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
                            avatar: member.displayAvatarURL({ forceStatic: false, size: 64 }),
                            status: member.presence?.status || 'offline',
                            bot: true,
                        }));

                    ws.send(JSON.stringify({ type: 'MEMBERS', data: { members, bots } }));
                }
            }

        } catch (err) {
            console.error('WS Error:', err);
        }
    });

    ws.on('close', () => {
        wsClients.delete(ws);
    });
});

function formatMessage(msg: Message) {
    return {
        id: msg.id,
        content: msg.content,
        author: {
            id: msg.author.id,
            username: msg.author.username,
            displayName: msg.author.displayName || msg.author.username,
            avatar: msg.author.displayAvatarURL({ forceStatic: false, size: 64 }),
            bot: msg.author.bot,
        },
        timestamp: msg.createdTimestamp,
        attachments: msg.attachments.map((att: Attachment) => ({ url: att.url, name: att.name, contentType: att.contentType })),
        channelId: msg.channelId,
        guildId: msg.guildId,
    };
}

function broadcast(data: any) {
    const jsonData = JSON.stringify(data);
    wsClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(jsonData);
    });
}

// Bot Events
client.on('messageCreate', (message) => broadcast({ type: 'NEW_MESSAGE', data: formatMessage(message) }));
client.once('ready', () => console.log(`✅ Bot logged in as ${client.user?.tag}`));

// Astro SSR Integration
// Use Express middleware to serve static files from dist/client
app.use(express.static('dist/client/'));
app.use(ssrHandler);

const PORT = Number(process.env.PORT) || 4321;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
if (!token) {
    console.error('❌ DISCORD_TOKEN is missing in .env');
    process.exit(1);
}

client.login(token);
