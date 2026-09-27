const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

// 1. WEB SERVER FOR RENDER
const app = express();
app.get('/', (req, res) => res.send('<h1>Ws_gc_2xbot Master Engine Live</h1>'));
app.listen(process.env.PORT || 3000);

// CONFIGURATION
const TG_BOT_TOKEN = '8992778279:AAHH7zvVcF3Oh1_KA3QR5Q_qRG7eEA6t02c';
const ADMIN_ID = 7959829014;
const ADMIN_USERNAME = 'egofiremax';
const LOG_CHANNEL = '@data5k';
const FORCE_SUB_CHAT = '@ai2kmm';
const FORCE_SUB_LINK = 'https://t.me/ai2kmm';

const bot = new Telegraf(TG_BOT_TOKEN);

// 2. MONGODB
if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('MongoDB Connected'))
        .catch(err => console.log('MongoDB Error:', err.message));
}

const User = mongoose.model('User', new mongoose.Schema({
    user_id: Number,
    username: String,
    language: { type: String, default: 'en' },
    is_vip: { type: Number, default: 0 },
    vip_expiry: { type: Number, default: 0 },
    joined_at: { type: Date, default: Date.now },
    phone_numbers: [String],
    is_connected: { type: Boolean, default: false }
}));

const activeSockets = {};
const userPhoneNumbers = {};
const userState = {};
const groupCreationData = {};
const spamTracker = {};

// 3. MENUS & HELPERS
const getFormattedTime = () => new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

async function sendLog(msg) {
    try {
        await bot.telegram.sendMessage(LOG_CHANNEL, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (e) { console.log('Log Error:', e.message); }
}

setInterval(() => {
    sendLog(`⚙️ <b>SYSTEM HEARTBEAT</b>\n\n⏱ Time: ${getFormattedTime()} (IST)\n✅ WhatsApp Automation Engine is Running.`);
}, 5 * 60 * 60 * 1000);

const getInlineMenu = () => Markup.inlineKeyboard([
    [Markup.button.callback('📱 Login Account', 'menu_login'), Markup.button.callback('📊 Status', 'menu_status')],
    [Markup.button.callback('➕ Create Group', 'menu_create'), Markup.button.callback('🗑️ Remove Members', 'menu_remove')],
    [Markup.button.callback('✏️ Edit Group', 'menu_edit'), Markup.button.callback('⚙️ Settings', 'menu_settings')],
    [Markup.button.callback('💎 Buy VIP', 'buy_vip'), Markup.button.callback('❓ Help', 'menu_help')]
]);

const getReplyKeyboard = () => Markup.keyboard([
    ['📱 Login Account', '📊 Status'],
    ['➕ Create Group', '🗑️ Remove Members'],
    ['✏️ Edit Group', '⚙️ Settings'],
    ['💎 Buy VIP', '❓ Help']
]).resize();

function cleanFolder(dir) {
    try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) { console.log('Cleanup error:', e.message); }
}

// 4. MIDDLEWARE
bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    const id = ctx.from.id;

    if (userState[id] === 'PROCESSING') {
        if (ctx.callbackQuery && ['request_new_code', 'stop_process'].includes(ctx.callbackQuery.data)) {
            return next();
        }
        const warning = '⏳ Process chal raha hai! Niche diye buttons use karein:';
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Get New Code', 'request_new_code')],
            [Markup.button.callback('🛑 Stop Service', 'stop_process')]
        ]);
        if (ctx.callbackQuery) await ctx.answerCbQuery(warning, { show_alert: true }).catch(()=>{});
        else if (ctx.message) await ctx.reply(warning, kb).catch(()=>{});
        return;
    }

    const now = Date.now();
    if (!spamTracker[id]) spamTracker[id] = [];
    spamTracker[id].push(now);
    spamTracker[id] = spamTracker[id].filter(t => now - t < 3000);
    if (spamTracker[id].length > 5) return;
    return next();
});

// 5. NAVIGATION & ACTIONS
async function checkSub(ctx) {
    try {
        const m = await ctx.telegram.getChatMember(FORCE_SUB_CHAT, ctx.from.id);
        return ['member', 'administrator', 'creator'].includes(m.status);
    } catch { return true; }
}

async function showHome(ctx) {
    let u = await User.findOne({ user_id: ctx.from.id });
    if (!u) {
        u = await User.create({
            user_id: ctx.from.id,
            username: ctx.from.username || 'NoUsername',
            is_vip: 1,
            vip_expiry: Math.floor(Date.now() / 1000) + 86400
        });
        sendLog(`🎉 <b>NEW USER JOINED!</b>\n\n👤 User: @${ctx.from.username || 'None'} (<code>${ctx.from.id}</code>)\n⏱ ${getFormattedTime()}`);
    }
    await ctx.reply('⚡ Dashboard Menu:', getReplyKeyboard());
    await ctx.reply('🏠 <b>Main Menu</b>\nSelect an option below:', { parse_mode: 'HTML', ...getInlineMenu() });
}

bot.command('start', async (ctx) => {
    userState[ctx.from.id] = null;
    const ok = await checkSub(ctx);
    if (!ok) {
        return ctx.reply('⚠️ Please join our channel to use this bot.', Markup.inlineKeyboard([
            [Markup.button.url('🔔 Join Channel', FORCE_SUB_LINK)],
            [Markup.button.callback('✅ Verify', 'check_sub')]
        ]));
    }
    showHome(ctx);
});

bot.action('check_sub', async (ctx) => {
    const ok = await checkSub(ctx);
    if (ok) {
        await ctx.answerCbQuery('✅ Verified!');
        showHome(ctx);
    } else {
        await ctx.answerCbQuery('❌ You have not joined yet!', { show_alert: true });
    }
});

bot.action('stop_process', async (ctx) => {
    const id = ctx.from.id;
    if (activeSockets[id]) {
        try { activeSockets[id].end(undefined); } catch {}
        delete activeSockets[id];
    }
    cleanFolder(`./auth_info_${id}`);
    userState[id] = null;
    delete userPhoneNumbers[id];
    delete groupCreationData[id];
    await ctx.answerCbQuery('Service Stopped').catch(()=>{});
    await ctx.reply('🛑 <b>Service Stopped Successfully.</b>', { parse_mode: 'HTML' });
    showHome(ctx);
});

bot.action('buy_vip', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply('💎 <b>VIP Plans:</b>\n\nContact Admin @egofiremax to activate VIP.', { parse_mode: 'HTML' });
});

bot.action('menu_help', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply('📖 <b>How to use:</b>\n\n1. <b>Login Account:</b> WhatsApp number daal kar link karein.\n2. <b>Status:</b> Linked numbers aur VIP validity check karein.\n3. <b>Create Group:</b> Automatic group generate karein invite link ke sath.', { parse_mode: 'HTML' });
});

// STATUS PANEL (FIXED: Shows Real Linked Numbers & VIP Details)
async function showUserStatus(ctx) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    const u = await User.findOne({ user_id: ctx.from.id });
    if (!u || !u.is_connected) {
        return ctx.reply("⚠️ <b>Action Required:</b> Aapka koi WhatsApp number linked nahi hai. Pehle <b>Login Account</b> par tap karein.", { parse_mode: 'HTML' });
    }

    const numbersList = u.phone_numbers && u.phone_numbers.length > 0 
        ? u.phone_numbers.map((num, i) => `${i + 1}. <code>+${num}</code>`).join('\n') 
        : 'Koi number save nahi hai';

    const isVip = u.is_vip && u.vip_expiry > Math.floor(Date.now() / 1000);
    const expiryDate = u.vip_expiry ? new Date(u.vip_expiry * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Expired';

    const statusMsg = `📊 <b>WHATSAPP & ACCOUNT STATUS</b>\n\n` +
        `👤 <b>User ID:</b> <code>${ctx.from.id}</code>\n` +
        `💎 <b>VIP Status:</b> ${isVip ? '✅ Active VIP' : '❌ Inactive / Free Trial Ended'}\n` +
        `⏳ <b>Validity:</b> ${expiryDate}\n\n` +
        `📱 <b>Linked WhatsApp Numbers:</b>\n${numbersList}\n\n` +
        `⚡ <b>Engine:</b> 🟢 Active & Ready`;

    ctx.reply(statusMsg, { parse_mode: 'HTML' });
}

bot.action('menu_status', showUserStatus);
bot.hears('📊 Status', showUserStatus);

// GROUP CREATION FLOW
async function initiateCreateGroup(ctx) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    const u = await User.findOne({ user_id: ctx.from.id });
    if (!u || !u.is_connected) {
        return ctx.reply("⚠️ <b>Action Required:</b> Group banane ke liye pehle WhatsApp link hona chahiye. <b>Login Account</b> karein.", { parse_mode: 'HTML' });
    }

    userState[ctx.from.id] = 'WAITING_GROUP_NAME';
    ctx.reply("➕ <b>Group Creation Setup</b>\n\nNaye group ka <b>Title / Name</b> bhejiye:", {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🛑 Cancel', 'stop_process')]])
    });
}

bot.action('menu_create', initiateCreateGroup);
bot.hears('➕ Create Group', initiateCreateGroup);

bot.hears(['🗑️ Remove Members', '✏️ Edit Group', '⚙️ Settings'], (ctx) => {
    ctx.reply("⚙️ Yeh feature VIP background maintenance mein hai. Jald live hoga!");
});

function promptLogin(ctx) {
    userState[ctx.from.id] = 'WAITING_NUMBER';
    ctx.reply('📱 Send your WhatsApp number with country code (e.g., 919876XXXXX):', Markup.inlineKeyboard([
        [Markup.button.callback('🛑 Cancel', 'stop_process')]
    ]));
}
bot.hears('📱 Login Account', promptLogin);
bot.action('menu_login', (ctx) => { ctx.answerCbQuery(); promptLogin(ctx); });

bot.hears('💎 Buy VIP', (ctx) => ctx.reply('💎 Contact @egofiremax for VIP access.'));
bot.hears('❓ Help', (ctx) => ctx.reply('📖 Send your WhatsApp number in Login Account to pair.', { parse_mode: 'HTML' }));

// ADMIN VIP COMMAND
bot.command('addvip', async (ctx) => {
    if (ctx.from.username !== ADMIN_USERNAME && ctx.from.id !== ADMIN_ID) return;
    const [, targetId, days] = ctx.message.text.split(' ');
    if (!targetId || !days) return ctx.reply('⚠️ Format: `/addvip <user_id> <days>`', { parse_mode: 'Markdown' });
    const expiry = Math.floor(Date.now() / 1000) + (parseInt(days) * 86400);
    const u = await User.findOneAndUpdate({ user_id: parseInt(targetId) }, { is_vip: 1, vip_expiry: expiry }, { new: true });
    if (u) {
        ctx.reply(`✅ Added VIP to ${targetId} for ${days} days.`);
        sendLog(`💎 <b>VIP ACTIVATED</b>\n\n👤 ID: <code>${targetId}</code>\n⏳ Days: ${days}\n⏱ ${getFormattedTime()}`);
    } else ctx.reply('❌ User not found.');
});

// 6. WHATSAPP CONNECTION & ACTIVE SOCKET MANAGER
async function getActiveWASocket(userId) {
    if (activeSockets[userId]) return activeSockets[userId];

    const sessionDir = `./auth_info_${userId}`;
    if (!fs.existsSync(sessionDir)) return null;

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        const logger = pino({ level: 'silent' });

        const sock = makeWASocket({
            version,
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            logger,
            browser: ['Ubuntu', 'Chrome', '20.0.0.0'],
            syncFullHistory: false
        });

        sock.ev.on('creds.update', saveCreds);
        activeSockets[userId] = sock;
        return sock;
    } catch (e) {
        console.log('Error reloading socket:', e.message);
        return null;
    }
}

async function startWhatsAppPairing(userId, phone, ctx) {
    userState[userId] = 'PROCESSING';
    userPhoneNumbers[userId] = phone;
    const sessionDir = `./auth_info_${userId}`;

    if (activeSockets[userId]) {
        try { activeSockets[userId].end(undefined); } catch {}
        delete activeSockets[userId];
    }
    cleanFolder(sessionDir);

    await ctx.reply(`⏳ Requesting secure pairing code for <b>+${phone}</b>...`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🛑 Cancel', 'stop_process')]])
    });

    let codeSent = false;

    async function initSocket() {
        if (userState[userId] !== 'PROCESSING') return;

        try {
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
            const { version } = await fetchLatestBaileysVersion();
            const logger = pino({ level: 'silent' });

            const sock = makeWASocket({
                version,
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger)
                },
                logger,
                browser: ['Ubuntu', 'Chrome', '20.0.0.0'],
                syncFullHistory: false,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 15000
            });

            activeSockets[userId] = sock;
            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode === 515 && userState[userId] === 'PROCESSING') {
                        initSocket();
                    } else if (statusCode === DisconnectReason.loggedOut) {
                        cleanFolder(sessionDir);
                        userState[userId] = null;
                        ctx.reply('❌ Device logged out. Please try logging in again.');
                    }
                }

                if (connection === 'open') {
                    userState[userId] = null;
                    delete userPhoneNumbers[userId];

                    sendLog(`🔑 <b>WHATSAPP LOGIN SUCCESS</b>\n\n👤 User: @${ctx.from.username || 'None'} (<code>${userId}</code>)\n📞 <code>${phone}</code>\n⏱ ${getFormattedTime()}`);
                    await ctx.reply('✅ <b>WhatsApp Account Linked Successfully!</b>\nAb aap <b>Create Group</b> feature use kar sakte hain.', { parse_mode: 'HTML' });
                    await User.updateOne({ user_id: userId }, { $set: { is_connected: true },$addToSet: { phone_numbers: phone } });
                    showHome(ctx);
                }
            });

            if (!sock.authState.creds.registered && !codeSent) {
                setTimeout(async () => {
                    try {
                        if (userState[userId] === 'PROCESSING' && !codeSent) {
                            codeSent = true;
                            let c = await sock.requestPairingCode(phone);
                            c = c?.match(/.{1,4}/g)?.join('-') || c;

                            await ctx.reply(
                                `✅ <b>Your WhatsApp Pairing Code:</b>\n\n<code>${c}</code>\n\n👉 <i>Tap on the code to copy it instantly!</i>\nEnter this in WhatsApp Linked Devices.\n\n⚠️ If code expires, tap <b>🔄 Get New Code</b> below:`,
                                {
                                    parse_mode: 'HTML',
                                    ...Markup.inlineKeyboard([
                                        [Markup.button.callback('🔄 Get New Code', 'request_new_code')],
                                        [Markup.button.callback('🛑 Stop Service', 'stop_process')]
                                    ])
                                }
                            );
                        }
                    } catch (e) {
                        ctx.reply(`❌ Could not generate pairing code: ${e.message}`, {
                            parse_mode: 'HTML',
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback('🔄 Try Again', 'request_new_code')],
                                [Markup.button.callback('🛑 Stop Service', 'stop_process')]
                            ])
                        });
                    }
                }, 3500);
            }
        } catch (e) { console.log('Socket Init Error:', e.message); }
    }

    initSocket();
}

bot.action('request_new_code', async (ctx) => {
    const id = ctx.from.id;
    const phone = userPhoneNumbers[id];
    if (!phone) {
        await ctx.answerCbQuery('⚠️ Session expired. Please send number again.', { show_alert: true });
        userState[id] = null;
        return promptLogin(ctx);
    }
    await ctx.answerCbQuery('🔄 Requesting new code...').catch(()=>{});
    await ctx.reply('🔄 Clearing session & requesting fresh code from WhatsApp...');
    startWhatsAppPairing(id, phone, ctx);
});

// 7. TEXT MESSAGE HANDLER FOR ALL STATES
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    const id = ctx.from.id;

    if (text.startsWith('/')) return;
    if (['📱 Login Account', '📊 Status', '➕ Create Group', '🗑️ Remove Members', '✏️ Edit Group', '⚙️ Settings', '💎 Buy VIP', '❓ Help'].includes(text)) return;

    // Login Number Input
    if (userState[id] === 'WAITING_NUMBER') {
        const phone = text.replace(/[^0-9]/g, '');
        if (phone.length < 10 || phone.length > 15) {
            return ctx.reply('❌ Invalid format! Please send your number with country code (e.g., 919876XXXXX).');
        }
        startWhatsAppPairing(id, phone, ctx);
        return;
    }

    // Create Group: Step 1 (Group Name)
    if (userState[id] === 'WAITING_GROUP_NAME') {
        groupCreationData[id] = { title: text };
        userState[id] = 'WAITING_GROUP_MEMBERS';
        return ctx.reply(`✅ Group Title set to: <b>${text}</b>\n\nAb jin numbers ko group mein add karna hai unhe bhejiye (comma ya space se separate karein, e.g., <code>919876543210, 918765432109</code>):\n\n<i>Ya bina kisi member ke sirf group banane ke liye <b>0</b> likhkar bhejein.</i>`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🛑 Cancel', 'stop_process')]])
        });
    }

    // Create Group: Step 2 (Group Members & Execution)
    if (userState[id] === 'WAITING_GROUP_MEMBERS') {
        const title = groupCreationData[id]?.title || 'New WhatsApp Group';
        let participants = [];

        if (text !== '0') {
            const rawNumbers = text.split(/[\s,]+/);
            participants = rawNumbers
                .map(num => num.replace(/[^0-9]/g, ''))
                .filter(num => num.length >= 10 && num.length <= 15)
                .map(num => `${num}@s.whatsapp.net`);
        }

        userState[id] = 'PROCESSING';
        await ctx.reply(`⏳ WhatsApp par <b>${title}</b> group banaya ja raha hai...`, { parse_mode: 'HTML' });

        try {
            const sock = await getActiveWASocket(id);
            if (!sock) {
                userState[id] = null;
                return ctx.reply("❌ WhatsApp session disconnected hai. Kripya pehle <b>Login Account</b> karke reconnect karein.", { parse_mode: 'HTML' });
            }

            const group = await sock.groupCreate(title, participants);
            let inviteCode = '';
            try { inviteCode = await sock.groupInviteCode(group.id); } catch(e){}

            const inviteLink = inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : 'Could not fetch link';

            userState[id] = null;
            delete groupCreationData[id];

            sendLog(`🎉 <b>GROUP CREATED SUCCESSFULLY</b>\n\n👤 User: @${ctx.from.username || 'None'} (<code>${id}</code>)\n🏷 Title: <b>${title}</b>\n🔗 Link: ${inviteLink}\n⏱ ${getFormattedTime()}`);

            await ctx.reply(
                `✅ <b>Group Successfully Created!</b>\n\n` +
                `🏷 <b>Group Name:</b> ${title}\n` +
                `👥 <b>Members Added:</b> ${participants.length}\n` +
                `🔗 <b>Invite Link:</b>\n${inviteLink}`,
                { parse_mode: 'HTML' }
            );
            showHome(ctx);

        } catch (err) {
            userState[id] = null;
            delete groupCreationData[id];
            ctx.reply(`❌ Group create karne mein error aaya: ${err.message}`);
            showHome(ctx);

        } catch (err) {
            userState[id] = null;
            delete groupCreationData[id];
            ctx.reply(`❌ Group create karne mein error aaya: ${err.message}`);
            showHome(ctx);
        }
    }
});

bot.launch().then(() => console.log('Bot Launched Successfully'));
