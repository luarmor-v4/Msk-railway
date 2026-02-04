const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { Connectors } = require('shoukaku');
const { Kazagumo } = require('kazagumo');
const express = require('express');

// ============ LOAD ENVIRONMENT VARIABLES ============
require('dotenv').config();

// ============ DEBUG: LOG ENVIRONMENT VARIABLES ============
console.log('🔍 Environment Check:');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('- PORT:', process.env.PORT || 'not set');
console.log('- DISCORD_TOKEN:', process.env.DISCORD_TOKEN ? `${process.env.DISCORD_TOKEN.substring(0, 30)}...` : '❌ NOT SET');
console.log('- LAVALINK_HOST:', process.env.LAVALINK_HOST || 'not set');
console.log('- LAVALINK_PASSWORD:', process.env.LAVALINK_PASSWORD ? '***' : '❌ NOT SET');
console.log('');

// ============ VALIDATE REQUIRED VARIABLES ============
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ FATAL ERROR: DISCORD_TOKEN environment variable is not set!');
    console.error('Please set DISCORD_TOKEN in Railway Dashboard → Variables tab');
    process.exit(1);
}

// Validate token format
const tokenRegex = /^[A-Za-z0-9_-]{24,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}$/;
if (!tokenRegex.test(process.env.DISCORD_TOKEN)) {
    console.error('❌ FATAL ERROR: DISCORD_TOKEN format is invalid!');
    console.error('Token should be in format: MTMwN...XXXX.XXXXXX.XXXXXXXXX');
    console.error('Current token length:', process.env.DISCORD_TOKEN.length);
    process.exit(1);
}

console.log('✅ DISCORD_TOKEN validation passed');
console.log('');

// ============ BOT INFO ============
const BOT_INFO = {
    name: 'Melodify',
    version: '1.0.0',
    description: 'HI i am development .',
    owner: {
        id: '1307489983359357019',
        username: 'demisz_dc',
        display: 'Demisz'
    },
    color: '#5865F2',
    links: {
        support: 'https://discord.gg/your-server',
        invite: 'https://discord.com/oauth2/authorize?client_id=1307489983359357019&permissions=3147776&scope=bot'
    }
};

// ============ EXPRESS KEEP-ALIVE ============
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).json({
        status: 'OK',
        bot: BOT_INFO.name,
        version: BOT_INFO.version,
        uptime: Math.floor(process.uptime()),
        discord: client.user ? {
            username: client.user.username,
            id: client.user.id,
            guilds: client.guilds.cache.size
        } : 'Not connected'
    });
});

app.get('/ping', (req, res) => res.status(200).send('OK'));

app.get('/health', (req, res) => {
    const health = {
        status: client.isReady() ? 'healthy' : 'unhealthy',
        uptime: process.uptime(),
        timestamp: Date.now(),
        guilds: client.guilds?.cache.size || 0,
        ready: client.isReady()
    };
    res.status(client.isReady() ? 200 : 503).json(health);
});

const server = app.listen(PORT, () => {
    console.log(`🌐 Express server running on port ${PORT}`);
});

// ============ DISCORD CLIENT ============
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ============ LAVALINK NODES ============
const Nodes = [
    {
        name: 'Railway-Primary',
        url: process.env.LAVALINK_HOST || 'lavalink-railway-production-c122.up.railway.app:443',
        auth: process.env.LAVALINK_PASSWORD || 'ToingDc',
        secure: true
    },
    {
        name: 'Serenetia-Backup',
        url: 'lavalinkv4.serenetia.com:443',
        auth: 'https://dsc.gg/ajidevserver',
        secure: true
    }
];

console.log('🎵 Lavalink Nodes Configuration:');
Nodes.forEach(node => {
    console.log(`  - ${node.name}: ${node.url} (secure: ${node.secure})`);
});
console.log('');

// ============ KAZAGUMO SETUP ============
const kazagumo = new Kazagumo(
    {
        defaultSearchEngine: 'youtube',
        send: (guildId, payload) => {
            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        }
    },
    new Connectors.DiscordJS(client),
    Nodes,
    { 
        moveOnDisconnect: false, 
        resumable: false, 
        reconnectTries: 5, 
        reconnectInterval: 5,
        restTimeout: 60000 
    }
);

// ============ LAVALINK EVENTS ============
kazagumo.shoukaku.on('ready', (name) => {
    console.log(`✅ Lavalink ${name} connected!`);
});

kazagumo.shoukaku.on('error', (name, error) => {
    console.error(`❌ Lavalink ${name} error:`, error.message);
});

kazagumo.shoukaku.on('disconnect', (name, reason) => {
    console.warn(`⚠️ Lavalink ${name} disconnected:`, reason);
});

kazagumo.shoukaku.on('reconnecting', (name, tries) => {
    console.log(`🔄 Lavalink ${name} reconnecting... (Attempt ${tries})`);
});

// ============ PLAYER EVENTS ============
kazagumo.on('playerStart', (player, track) => {
    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(BOT_INFO.color)
        .setAuthor({ name: 'Now Playing 🎵', iconURL: client.user.displayAvatarURL() })
        .setTitle(track.title)
        .setURL(track.uri)
        .setThumbnail(track.thumbnail || null)
        .addFields(
            { name: 'Duration', value: formatDuration(track.length), inline: true },
            { name: 'Author', value: track.author || 'Unknown', inline: true },
            { name: 'Requested by', value: `${track.requester}`, inline: true }
        )
        .setFooter({ text: `Volume: ${player.volume}%  •  ${BOT_INFO.name} v${BOT_INFO.version}` })
        .setTimestamp();

    channel.send({ embeds: [embed] }).catch(console.error);
});

kazagumo.on('playerEmpty', (player) => {
    const channel = client.channels.cache.get(player.textId);
    if (channel) {
        const embed = new EmbedBuilder()
            .setColor('#ff6b6b')
            .setDescription('⏹️ Queue finished. Disconnecting...')
            .setTimestamp();
        channel.send({ embeds: [embed] }).catch(console.error);
    }
    player.destroy();
});

kazagumo.on('playerError', (player, error) => {
    console.error('Player error:', error);
    const channel = client.channels.cache.get(player.textId);
    if (channel) {
        channel.send({ embeds: [errorEmbed('Failed to play track. Skipping...')] }).catch(console.error);
    }
    if (player.queue.size > 0) {
        player.skip();
    }
});

// ============ BOT READY ============
client.once('ready', () => {
    console.log('═══════════════════════════════════════');
    console.log(`🤖 ${client.user.tag} is online!`);
    console.log(`📊 Serving ${client.guilds.cache.size} servers`);
    console.log(`👥 Serving ${client.users.cache.size} users`);
    console.log(`🎵 Nodes: ${Nodes.map(n => n.name).join(', ')}`);
    console.log(`🚂 Running on Railway!`);
    console.log('═══════════════════════════════════════');
    
    client.user.setActivity('!help • Music Bot', { type: 2 });
});

// ============ HELPER FUNCTIONS ============
function formatDuration(ms) {
    if (!ms || ms === 0) return '🔴 Live';
    const s = Math.floor((ms / 1000) % 60);
    const m = Math.floor((ms / (1000 * 60)) % 60);
    const h = Math.floor(ms / (1000 * 60 * 60));
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
}

function errorEmbed(message) {
    return new EmbedBuilder().setColor('#ff6b6b').setDescription(`❌ ${message}`);
}

function successEmbed(message) {
    return new EmbedBuilder().setColor(BOT_INFO.color).setDescription(message);
}

// ============ MESSAGE COMMANDS ============
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const validCommands = ['play', 'p', 'skip', 's', 'stop', 'pause', 'resume', 'queue', 'q', 'nowplaying', 'np', 'loop', 'volume', 'vol', 'seek', '8d', 'help', 'info', 'ping', 'nodes'];
    if (!validCommands.includes(command)) return;

    // ==================== PLAY ====================
    if (command === 'play' || command === 'p') {
        if (!message.member.voice.channel) {
            return message.reply({ embeds: [errorEmbed('Join a voice channel first!')] });
        }

        const query = args.join(' ');
        if (!query) {
            return message.reply({ embeds: [errorEmbed('Please provide a song name or URL!\n`!play <song name/url>`')] });
        }

        try {
            let player = kazagumo.players.get(message.guild.id);

            if (!player) {
                player = await kazagumo.createPlayer({
                    guildId: message.guild.id,
                    textId: message.channel.id,
                    voiceId: message.member.voice.channel.id,
                    volume: 70,
                    deaf: true,
                    shardId: message.guild.shardId
                });
            }

            const result = await kazagumo.search(query, { requester: message.author });

            if (!result || !result.tracks.length) {
                return message.reply({ embeds: [errorEmbed('No results found!')] });
            }

            if (result.type === 'PLAYLIST') {
                for (const track of result.tracks) {
                    player.queue.add(track);
                }
                const embed = new EmbedBuilder()
                    .setColor(BOT_INFO.color)
                    .setDescription(`📃 Added **${result.tracks.length}** tracks from **${result.playlistName}**`);
                message.channel.send({ embeds: [embed] });
            } else {
                player.queue.add(result.tracks[0]);
                if (player.playing || player.paused) {
                    const embed = new EmbedBuilder()
                        .setColor(BOT_INFO.color)
                        .setDescription(`➕ Added to queue: **${result.tracks[0].title}**`);
                    message.channel.send({ embeds: [embed] });
                }
            }

            if (!player.playing && !player.paused) player.play();

        } catch (error) {
            console.error('Play error:', error);
            message.reply({ embeds: [errorEmbed('An error occurred while playing!')] });
        }
    }

    // ==================== SKIP ====================
    if (command === 'skip' || command === 's') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player?.queue.current) return message.reply({ embeds: [errorEmbed('Nothing to skip!')] });

        player.skip();
        message.react('⏭️').catch(console.error);
    }

    // ==================== STOP ====================
    if (command === 'stop') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });

        player.destroy();
        message.react('⏹️').catch(console.error);
    }

    // ==================== PAUSE ====================
    if (command === 'pause') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });

        player.pause(true);
        message.react('⏸️').catch(console.error);
    }

    // ==================== RESUME ====================
    if (command === 'resume') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });

        player.pause(false);
        message.react('▶️').catch(console.error);
    }

    // ==================== QUEUE ====================
    if (command === 'queue' || command === 'q') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player?.queue.current) return message.reply({ embeds: [errorEmbed('Queue is empty!')] });

        const current = player.queue.current;
        const queue = player.queue;

        let description = `**Now Playing:**\n[${current.title}](${current.uri}) • \`${formatDuration(current.length)}\`\n\n`;

        if (queue.length > 0) {
            description += `**Up Next:**\n`;
            queue.slice(0, 10).forEach((track, i) => {
                description += `\`${i + 1}.\` [${track.title}](${track.uri}) • \`${formatDuration(track.length)}\`\n`;
            });
            if (queue.length > 10) description += `\n*...and ${queue.length - 10} more*`;
        }

        const embed = new EmbedBuilder()
            .setColor(BOT_INFO.color)
            .setAuthor({ name: `Queue • ${message.guild.name}`, iconURL: message.guild.iconURL() })
            .setDescription(description)
            .setFooter({ text: `${queue.length + 1} tracks • Volume: ${player.volume}%` });

        message.channel.send({ embeds: [embed] });
    }

    // ==================== NOW PLAYING ====================
    if (command === 'nowplaying' || command === 'np') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player?.queue.current) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });

        const current = player.queue.current;
        const position = player.position;
        const duration = current.length;

        const progress = duration ? Math.round((position / duration) * 15) : 0;
        const bar = '▬'.repeat(progress) + '🔘' + '▬'.repeat(15 - progress);

        const embed = new EmbedBuilder()
            .setColor(BOT_INFO.color)
            .setAuthor({ name: 'Now Playing', iconURL: client.user.displayAvatarURL() })
            .setTitle(current.title)
            .setURL(current.uri)
            .setThumbnail(current.thumbnail)
            .addFields(
                { name: 'Author', value: current.author || 'Unknown', inline: true },
                { name: 'Requested by', value: `${current.requester}`, inline: true },
                { name: 'Volume', value: `${player.volume}%`, inline: true }
            )
            .setDescription(`\`${formatDuration(position)}\` ${bar} \`${formatDuration(duration)}\``)
            .setFooter({ text: `Loop: ${player.loop || 'Off'}` });

        message.channel.send({ embeds: [embed] });
    }

    // ==================== LOOP ====================
    if (command === 'loop') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });

        const mode = args[0]?.toLowerCase();
        if (!mode || !['track', 'queue', 'off'].includes(mode)) {
            return message.reply({ embeds: [errorEmbed('Usage: `!loop <track/queue/off>`')] });
        }

        player.setLoop(mode === 'off' ? 'none' : mode);
        
        const icons = { track: '🔂', queue: '🔁', off: '➡️' };
        message.channel.send({ embeds: [successEmbed(`${icons[mode]} Loop: **${mode.charAt(0).toUpperCase() + mode.slice(1)}**`)] });
    }

    // ==================== VOLUME ====================
    if (command === 'volume' || command === 'vol') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });

        if (!args[0]) {
            return message.channel.send({ embeds: [successEmbed(`🔊 Current volume: **${player.volume}%**`)] });
        }

        const volume = parseInt(args[0]);
        if (isNaN(volume) || volume < 0 || volume > 100) {
            return message.reply({ embeds: [errorEmbed('Volume must be between 0-100')] });
        }

        player.setVolume(volume);
        const icon = volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊';
        message.channel.send({ embeds: [successEmbed(`${icon} Volume: **${volume}%**`)] });
    }

    // ==================== SEEK ====================
    if (command === 'seek') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player?.queue.current) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });

        const time = args[0];
        if (!time) return message.reply({ embeds: [errorEmbed('Usage: `!seek <1:30>` or `!seek <90>`')] });

        let ms;
        if (time.includes(':')) {
            const parts = time.split(':').map(Number);
            ms = parts.length === 2 ? (parts[0] * 60 + parts[1]) * 1000 : (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
        } else {
            ms = parseInt(time) * 1000;
        }

        if (isNaN(ms) || ms < 0 || ms > player.queue.current.length) {
            return message.reply({ embeds: [errorEmbed('Invalid time!')] });
        }

        player.seek(ms);
        message.channel.send({ embeds: [successEmbed(`⏩ Seeked to **${formatDuration(ms)}**`)] });
    }

    // ==================== 8D ====================
    if (command === '8d') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });

        const isEnabled = player.rotation?.rotationHz;
        if (isEnabled) {
            player.setRotation({ rotationHz: 0 });
            message.channel.send({ embeds: [successEmbed('🎧 8D Audio: **Off**')] });
        } else {
            player.setRotation({ rotationHz: 0.2 });
            message.channel.send({ embeds: [successEmbed('🎧 8D Audio: **On** (Use headphones!)')] });
        }
    }

    // ==================== NODES ====================
    if (command === 'nodes') {
        const nodesInfo = kazagumo.shoukaku.nodes;
        let description = '';

        nodesInfo.forEach((node, name) => {
            const status = node.state === 2 ? '🟢 Connected' : node.state === 1 ? '🟡 Connecting' : '🔴 Disconnected';
            const stats = node.stats;
            description += `**${name}**\n`;
            description += `Status: ${status}\n`;
            description += `URL: \`${node.url}\`\n`;
            if (stats) {
                description += `Players: ${stats.players} | Playing: ${stats.playingPlayers}\n`;
                description += `Uptime: ${formatDuration(stats.uptime)}\n`;
                description += `Memory: ${Math.round(stats.memory.used / 1024 / 1024)}MB / ${Math.round(stats.memory.allocated / 1024 / 1024)}MB\n`;
            }
            description += `\n`;
        });

        const embed = new EmbedBuilder()
            .setColor(BOT_INFO.color)
            .setAuthor({ name: 'Lavalink Nodes Status', iconURL: client.user.displayAvatarURL() })
            .setDescription(description || 'No nodes available')
            .setFooter({ text: `Total Nodes: ${nodesInfo.size}` })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }

    // ==================== HELP ====================
    if (command === 'help') {
        const embed = new EmbedBuilder()
            .setColor(BOT_INFO.color)
            .setAuthor({ name: BOT_INFO.name, iconURL: client.user.displayAvatarURL() })
            .setDescription(BOT_INFO.description)
            .addFields(
                {
                    name: '🎵 Music',
                    value: '```\n!play <song>  - Play a song\n!skip         - Skip current\n!stop         - Stop & leave\n!pause        - Pause\n!resume       - Resume\n```',
                    inline: false
                },
                {
                    name: '📋 Queue',
                    value: '```\n!queue        - View queue\n!nowplaying   - Current song\n!loop <mode>  - track/queue/off\n```',
                    inline: false
                },
                {
                    name: '🎛️ Control',
                    value: '```\n!volume <0-100> - Set volume\n!seek <1:30>    - Seek to time\n!8d             - Toggle 8D\n```',
                    inline: false
                },
                {
                    name: '⚙️ System',
                    value: '```\n!info         - Bot info\n!nodes        - Node status\n!ping         - Check latency\n```',
                    inline: false
                }
            )
            .setFooter({ text: `Made by ${BOT_INFO.owner.display} • v${BOT_INFO.version}` })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }

    // ==================== INFO ====================
    if (command === 'info') {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);

        const embed = new EmbedBuilder()
            .setColor(BOT_INFO.color)
            .setAuthor({ name: BOT_INFO.name, iconURL: client.user.displayAvatarURL() })
            .setDescription(BOT_INFO.description)
            .addFields(
                { name: '👨‍💻 Developer', value: `<@${BOT_INFO.owner.id}>`, inline: true },
                { name: '📊 Servers', value: `${client.guilds.cache.size}`, inline: true },
                { name: '⏱️ Uptime', value: `${hours}h ${minutes}m`, inline: true },
                { name: '🏷️ Version', value: BOT_INFO.version, inline: true },
                { name: '📚 Library', value: 'Discord.js v14', inline: true },
                { name: '🎵 Audio', value: 'Lavalink v4', inline: true },
                { name: '🚂 Hosting', value: 'Railway', inline: true }
            )
            .setFooter({ text: `Requested by ${message.author.tag}` })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }

    // ==================== PING ====================
    if (command === 'ping') {
        const latency = Date.now() - message.createdTimestamp;
        
        let nodesLatency = '';
        kazagumo.shoukaku.nodes.forEach((node, name) => {
            if (node.state === 2) {
                nodesLatency += `${name}: \`${node.stats?.ping || 'N/A'}ms\`\n`;
            }
        });

        const embed = new EmbedBuilder()
            .setColor(BOT_INFO.color)
            .setDescription(`🏓 **Pong!**\n📡 Bot Latency: \`${latency}ms\`\n💓 API Latency: \`${Math.round(client.ws.ping)}ms\`\n\n**Lavalink Nodes:**\n${nodesLatency || 'No nodes connected'}`);

        message.channel.send({ embeds: [embed] });
    }
});

// ============ ERROR HANDLING ============
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
});

client.on('error', (error) => {
    console.error('❌ Discord client error:', error);
});

client.on('warn', (info) => {
    console.warn('⚠️ Discord client warning:', info);
});

// ============ GRACEFUL SHUTDOWN ============
process.on('SIGTERM', () => {
    console.log('⏹️ SIGTERM received, shutting down gracefully...');
    client.destroy();
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('⏹️ SIGINT received, shutting down gracefully...');
    client.destroy();
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

// ============ LOGIN ============
console.log('🔐 Attempting to login to Discord...');
console.log('Token length:', process.env.DISCORD_TOKEN.length);
console.log('');

client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log('✅ Successfully logged in to Discord!');
    })
    .catch((error) => {
        console.error('═══════════════════════════════════════');
        console.error('❌ FAILED TO LOGIN TO DISCORD');
        console.error('═══════════════════════════════════════');
        console.error('Error:', error.message);
        console.error('Code:', error.code);
        console.error('');
        console.error('Troubleshooting:');
        console.error('1. Check DISCORD_TOKEN in Railway Variables');
        console.error('2. Token format: MTMwN...XXXX.XXXXXX.XXXXXXXXX');
        console.error('3. Token length should be 70-80 characters');
        console.error('4. Regenerate token at: https://discord.com/developers');
        console.error('5. Make sure MESSAGE CONTENT INTENT is enabled');
        console.error('═══════════════════════════════════════');
        process.exit(1);
    });
