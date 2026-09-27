const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. SERVER & CONFIGURATION
// ==========================================
const app = express();
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ws_gc_2xbot Status</title>
            <style>
                body { background-color: #0f172a; color: #10b981; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; text-align: center; }
                .container { background: #1e293b; padding: 40px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
                h1 { color: #38bdf8; margin-bottom: 10px; }
                p { font-size: 1.2rem; color: #cbd5e1; }
                .status { margin-top: 20px; font-weight: bold; background: #064e3b; padding: 10px; border-radius: 8px; color: #34d399; }
                .footer { margin-top: 30px; font-size: 0.9rem; color: #64748b; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 Ws_gc_2xbot Master Engine</h1>
                <p>24/7 Automation & WhatsApp Engine</p>
                <div class="status">✅ System is Live & Running</div>
                <div class="footer">Developed for Telegram Automation</div>
            </div>
        </body>
        </html>
    `);
});
app.listen(process.env.PORT || 3000);

const TG_BOT_TOKEN = '8992778279:AAHH7zvVcF3Oh1_KA3QR5Q_qRG7eEA6t02c';
const ADMIN_ID = 7959829014;
const ADMIN_USERNAME = 'egofiremax';
const LOG_CHANNEL = '@data5k';
const FORCE_SUB_CHAT_ID = '@ai2kmm';
const FORCE_SUB_LINK = 'https://t.me/ai2kmm';

const bot = new Telegraf(TG_BOT_TOKEN);

// ==========================================
// 2. DATABASE & SCHEMAS
// ==========================================
const MONGODB_URI = process.env.MONGODB_URI; 
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI).then(() => console.log('MongoDB Connected')).catch(err => console.log(err));
}

const UserSchema = new mongoose.Schema({
    user_id: Number,
    username: String,
    language: { type: String, default: 'en' },
    is_vip: { type: Number, default: 0 },
    vip_expiry: { type: Number, default: 0 }, 
    joined_at: { type: Date, default: Date.now },
    phone_numbers: [String],
    is_connected: { type: Boolean, default: false }
});
const User = mongoose.model('User', UserSchema);

const activeSockets = {};
const userPhoneNumbers = {};
const userState = {};
const spamTracker = {};

// ==========================================
// 3. MENUS (INLINE + PERSISTENT KEYBOARD)
// ==========================================
const langData = {
    en: { 
        menu: "🏠 <b>Main Menu</b>\nSelect an option below:", 
        btn_login: "📱 Login Account", btn_status: "📊 Status", btn_create: "➕ Create Group", btn_remove: "🗑️ Remove Members", btn_edit: "✏️ Edit Group", btn_settings: "⚙️ Settings", btn_lang: "🌐 Change Lang", btn_vip: "💎 Buy VIP", btn_help: "❓ Help",
        help_text: "📖 <b>How to use this Bot:</b>\n\n1. Click on <b>Login Account</b>.\n2. Send your WhatsApp number with country code (e.g., 919876XXXXX).\n3. Tap on the 8-digit code to copy it instantly.\n4. Enter the code in your WhatsApp Linked Devices.\n5. If the code expires, tap <b>🔄 Get New Code</b>.\n\n⚠️ <i>VIP is required for unlimited usage.</i>"
    },
    id: { 
        menu: "🏠 <b>Menu Utama</b>\nPilih opsi di bawah:", 
        btn_login: "📱 Masuk Akun", btn_status: "📊 Status", btn_create: "➕ Buat Grup", btn_remove: "🗑️ Hapus Anggota", btn_edit: "✏️ Edit Grup", btn_settings: "⚙️ Pengaturan", btn_lang: "🌐 Ganti Bahasa", btn_vip: "💎 Beli VIP", btn_help: "❓ Bantuan",
        help_text: "📖 <b>Cara menggunakan Bot ini:</b>\n\n1. Klik <b>Masuk Akun</b>.\n2. Kirim nomor WhatsApp Anda (contoh: 628123XXXXX).\n3. Ketuk kode 8 digit untuk menyalin langsung.\n4. Masukkan kode di Perangkat Tertaut WhatsApp Anda.\n5. Jika kedaluwarsa, klik <b>🔄 Get New Code</b>.\n\n⚠️ <i>Akses VIP diperlukan untuk tanpa batas.</i>"
    },
    zh: { 
        menu: "🏠 <b>主菜单</b>\n请选择以下选项：", 
        btn_login: "📱 登录账号", btn_status: "📊 状态", btn_create: "➕ 创建群组", btn_remove: "🗑️ 删除成员", btn_edit: "✏️ 编辑群组", btn_settings: "⚙️ 设置", btn_lang: "🌐 更改语言", btn_vip: "💎 购买 VIP", btn_help: "❓ 帮助",
        help_text: "📖 <b>如何使用此机器人:</b>\n\n1. 点击 <b>登录账号</b>。\n2. 发送带国家代码的WhatsApp号码。\n3. 点击8位配对码即可一键复制。\n4. 在WhatsApp已关联设备中输入。\n5. 如果代码过期，请点击 <b>🔄 Get New Code</b> 获取新代码。\n\n⚠️ <i>无限制使用需要VIP。</i>"
    }
};

function getInlineMenu(lang) {
    const t = langData[lang] || langData['en'];
    return Markup.inlineKeyboard([
        [Markup.button.callback(t.btn_login, 'menu_login'), Markup.button.callback(t.btn_status, 'menu_status')],
        [Markup.button.callback(t.btn_create, 'menu_create'), Markup.button.callback(t.btn_remove, 'menu_remove')],
        [Markup.button.callback(t.btn_edit, 'menu_edit'), Markup.button.callback(t.btn_settings, 'menu_settings')],
        [Markup.button.callback(t.btn_vip, 'buy_vip'), Markup.button.callback(t.btn_help, 'menu_help')],
        [Markup.button.callback(t.btn_lang, 'change_lang')]
    ]);
}

function getReplyKeyboard() {
    return Markup.keyboard([
        ['📱 Login Account', '📊 Status'],
        ['➕ Create Group', '🗑️ Remove Members'],
        ['✏️ Edit Group', '⚙️ Settings'],
        ['💎 Buy VIP', '❓ Help']
    ]).resize();
}

// ==========================================
// 4. LOGGING & HEARTBEAT ENGINE (@data5k)
// ==========================================
async function sendLog(message) {
    try {
        await bot.telegram.sendMessage(LOG_CHANNEL, message, { parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (e) { console.log("Log error:", e.message); }
}

setInterval(() => {
    const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    sendLog(`⚙️ <b>SYSTEM HEARTBEAT</b>\n\n⏱ Time: ${time} (IST)\n✅ All services and WhatsApp engines are running smoothly.`);
}, 5 * 60 * 60 * 1000);

function getFormattedTime() {
    return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function formatUserForLog(fromObj) {
    const usernameStr = fromObj.username ? `@${fromObj.username}` : 'NoUsername';
    return `${usernameStr} (<code>${fromObj.id}</code>)`;
}

// ==========================================
// 5. CORE BOT & BUSY LOCK
// ==========================================
bot.use(async (ctx, next) => {
    if (ctx.from) {
        const id = ctx.from.id;
        
        if (userState[id] === 'PROCESSING') {
            if (ctx.callbackQuery && ['request_new_code', 'stop_process'].includes(ctx.callbackQuery.data)) {
                return next();
            }

            const warningMsg = '⏳ Service is currently active! Please link WhatsApp using the code or use the buttons below.';
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery(warningMsg, { show_alert: true }).catch(()=>{});
            } else if (ctx.message) {
                await ctx.reply(warningMsg, Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Get New Code', 'request_new_code')],
                    [Markup.button.callback('🛑 Stop Service', 'stop_process')]
                ])).catch(()=>{});
                return;
            }
        }

        const now = Date.now();
        if (!spamTracker[id]) spamTracker[id] = [];
        spamTracker[id].push(now);
        spamTracker[id] = spamTracker[id].filter(time => now - time < 3000); 
        
        if (spamTracker[id].length > 5) {
            if (spamTracker[id].length === 6) { 
                sendLog(`⚠️ <b>SPAM ALERT!</b>\n\n👤 User: ${formatUserForLog(ctx.from)}\n⏱ Time: ${getFormattedTime()}`);
            }
            return; 
        }
    }
    return next();
});

// Stop Service Handler
bot.action('stop_process', async (ctx) => {
    const userId = ctx.from.id;
    if (activeSockets[userId]) {
        try { activeSockets[userId].end(new Error("Stopped by user")); } catch(e){}
        delete activeSockets[userId];
    }
    const sessionPath = `./auth_info_${userId}`;
    deleteFolderRecursive(sessionPath);
    userState[userId] = null;
    delete userPhoneNumbers[userId];

    await ctx.answerCbQuery("Service Stopped").catch(()=>{});
    await ctx.reply("🛑 <b>Service Stopped Successfully.</b>\nYou can now use other menu options.", { parse_mode: 'HTML' });
    showMainMenu(ctx);
});

async function isSubscribed(ctx) {
    try {
        const chatMember = await ctx.telegram.getChatMember(FORCE_SUB_CHAT_ID, ctx.from.id);
        return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch (e) { return true; }
}

bot.command('start', async (ctx) => {
    userState[ctx.from.id] = null;
    const subscribed = await isSubscribed(ctx);
    if (!subscribed) {
        return ctx.reply('⚠️ Join our channel to use this bot.', Markup.inlineKeyboard([[Markup.button.url('🔔 Join Channel', FORCE_SUB_LINK)], [Markup.button.callback('✅ Verify', 'check_sub')]]));
    }
    await ctx.reply("⚡ Bot Dashboard Loaded:", getReplyKeyboard());
    showMainMenu(ctx);
});

bot.action('check_sub', async (ctx) => {
    const subscribed = await isSubscribed(ctx);
    if (subscribed) {
        ctx.answerCbQuery('✅ Verification Successful!');
        await ctx.reply("⚡ Bot Dashboard Loaded:", getReplyKeyboard());
        showMainMenu(ctx);
    } else {
        ctx.answerCbQuery('❌ You have not joined the channel!', { show_alert: true });
    }
});

async function showMainMenu(ctx) {
    try {
        let user = await User.findOne({ user_id: ctx.from.id });
        if (!user) {
            user = new User({ 
                user_id: ctx.from.id, 
                username: ctx.from.username || 'NoUsername',
                is_vip: 1, 
                vip_expiry: Math.floor(Date.now() / 1000) + (24 * 60 * 60) 
            });
            await user.save();
            sendLog(`🎉 <b>NEW USER JOINED!</b>\n\n👤 User: ${formatUserForLog(ctx.from)}`);
            
            return ctx.reply("🎉 Welcome! Select language:", Markup.inlineKeyboard([
                [Markup.button.callback('🇬🇧 English', 'lang_en'), Markup.button.callback('🇮🇩 Indo', 'lang_id'), Markup.button.callback('🇨🇳 中文', 'lang_zh')]
            ]));
        }
        const userLang = user.language || 'en';
        ctx.reply(langData[userLang].menu, { parse_mode: 'HTML', ...getInlineMenu(userLang) });
    } catch (e) { console.log(e); }
}

bot.action(/lang_(.+)/, async (ctx) => {
    const lang = ctx.match[1];
    await User.findOneAndUpdate({ user_id: ctx.from.id }, { language: lang });
    ctx.editMessageText("✅ Language saved.\n\n" + langData[lang].menu, { parse_mode: 'HTML', ...getInlineMenu(lang) });
});

bot.action('change_lang', (ctx) => {
    ctx.editMessageText("🌐 Select your language:", Markup.inlineKeyboard([
        [Markup.button.callback('🇬🇧 English', 'lang_en'), Markup.button.callback('🇮🇩 Indo', 'lang_id'), Markup.button.callback('🇨🇳 中文', 'lang_zh')]
    ]));
});

bot.action('menu_help', async (ctx) => {
    const user = await User.findOne({ user_id: ctx.from.id });
    const lang = user ? user.language : 'en';
    ctx.reply(langData[lang].help_text, { parse_mode: 'HTML' });
    ctx.answerCbQuery();
});

bot.action('buy_vip', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("💎 <b>VIP Plans:</b>\n\n- 1 Month: ₹30\n- 6 Months: ₹120\n\nContact Admin @egofiremax to activate.", { parse_mode: 'HTML' });
});

// STATUS & VALIDATIONS
async function handleActionValidation(ctx) {
    const user = await User.findOne({ user_id: ctx.from.id });
    if (!user || !user.is_connected) {
        if (ctx.callbackQuery) await ctx.answerCbQuery("⚠️ Please link WhatsApp first!", { show_alert: true });
        return ctx.reply("⚠️ <b>Action Required:</b> You haven't linked your WhatsApp account yet. Please click <b>Login Account</b> first.", { parse_mode: 'HTML' });
    }
    if (ctx.callbackQuery) ctx.answerCbQuery();
    ctx.reply("📊 Your WhatsApp account is connected and ready!");
}

bot.action(['menu_status', 'menu_create', 'menu_edit', 'menu_remove'], handleActionValidation);
bot.hears(['📊 Status', '➕ Create Group', '🗑️ Remove Members', '✏️ Edit Group'], handleActionValidation);

bot.hears('📱 Login Account', (ctx) => initiateLogin(ctx));
bot.action('menu_login', (ctx) => { ctx.answerCbQuery(); initiateLogin(ctx); });

function initiateLogin(ctx) {
    userState[ctx.from.id] = 'WAITING_NUMBER';
    ctx.reply("📱 Send your WhatsApp number with country code (e.g., 919876XXXXX):", Markup.inlineKeyboard([
        [Markup.button.callback('🛑 Cancel', 'stop_process')]
    ]));
}

bot.hears('⚙️ Settings', (ctx) => ctx.reply("⚙️ Settings panel options."));
bot.hears('💎 Buy VIP', (ctx) => ctx.reply("💎 Contact admin @egofiremax to buy VIP access."));
bot.hears('❓ Help', (ctx) => ctx.reply(langData['en'].help_text, { parse_mode: 'HTML' }));

// ==========================================
// 6. VIP COMMAND (/addvip)
// ==========================================
bot.command('addvip', async (ctx) => {
    if (ctx.from.username !== ADMIN_USERNAME && ctx.from.id !== ADMIN_ID) {
        return ctx.reply("🚫 Only Owner can use this command.");
    }
    const parts = ctx.message.text.split(' ');
    if (parts.length !== 3) {
        return ctx.reply("⚠️ Format: `/addvip <user_id> <days>`", { parse_mode: 'Markdown' });
    }
    const targetId = parseInt(parts[1]);
    const days = parseInt(parts[2]);
    const expiryTime = Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
    
    const user = await User.findOneAndUpdate({ user_id: targetId }, { is_vip: 1, vip_expiry: expiryTime }, { new: true });
    if (user) {
        ctx.reply(`✅ Successfully added VIP to ${targetId} for ${days} days.`);
        sendLog(`💎 <b>VIP ACTIVATED (By Admin)</b>\n\n👤 Target ID: <code>${targetId}</code>\n⏳ Duration: ${days} Days`);
        bot.telegram.sendMessage(targetId, `🎉 Congratulations! Your VIP access has been activated for ${days} days!`).catch(()=>{});
    } else {
        ctx.reply("❌ User not found in database.");
    }
});

// ==========================================
// 7. CRITICAL FIX: WHATSAPP ENGINE WITH 515 AUTO-RESTART
// ==========================================
function deleteFolderRecursive(directoryPath) {
    if (fs.existsSync(directoryPath)) {
        fs.readdirSync(directoryPath).forEach((file) => {
            const curPath = path.join(directoryPath, file);
            if (fs.lstatSync(curPath).isDirectory()) { 
                deleteFolderRecursive(curPath);
            } else { 
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(directoryPath);
    }
}

async function startWhatsAppPairing(userId, phoneNumber, ctx) {
    userState[userId] = 'PROCESSING';
    userPhoneNumbers[userId] = phoneNumber;
    const sessionPath = `./auth_info_${userId}`;

    if (activeSockets[userId]) {
        try { activeSockets[userId].end(new Error("New session started")); } catch(e){}
        delete activeSockets[userId];
    }
    deleteFolderRecursive(sessionPath);

    await ctx.reply(`⏳ Connecting WhatsApp Engine for <b>+${phoneNumber}</b>...\n\n<i>(Generating pairing code, please wait...)</i>`, { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🛑 Cancel', 'stop_process')]])
    });

    let codeRequested = false;

    async function connectSocket() {
        if (userState[userId] !== 'PROCESSING') return;

        try {
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
            const { version } = await fetchLatestBaileysVersion();

            const waSock = makeWASocket({
                version,
                printQRInTerminal: false,
                auth: state,
                logger: pino({ level: "silent" }),
                browser: ["Ubuntu", "Chrome", "22.04.4"],
                syncFullHistory: false,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 10000
            });

            activeSockets[userId] = waSock;
            waSock.ev.on("creds.update", saveCreds);

            waSock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    if (shouldReconnect && userState[userId] === 'PROCESSING') {
                        connectSocket();
                    } else if (statusCode === DisconnectReason.loggedOut) {
                        deleteFolderRecursive(sessionPath);
                        userState[userId] = null;
                        ctx.reply("❌ Device was logged out. Please click Login Account again.");
                    }
                }

                if (connection === 'open') {
                    if (activeSockets[userId]) {
                        delete activeSockets[userId];
                    }
                    userState[userId] = null;
                    delete userPhoneNumbers[userId];

                    sendLog(`🔑 <b>WHATSAPP LOGIN SUCCESSFUL</b>\n\n👤 User: ${formatUserForLog(ctx.from)}\n📞 Number: <code>${phoneNumber}</code>\n⏱ Time: ${getFormattedTime()}\n✅ Status: Linked Successfully!`);
                    await ctx.reply(`✅ <b>WhatsApp Account Linked Successfully!</b>\nYour device is now fully connected.`, { parse_mode: 'HTML' });
                    await User.updateOne({ user_id: userId }, { $set: { is_connected: true },$addToSet: { phone_numbers: phoneNumber } });
                    showMainMenu(ctx);
                }
            });

            if (!waSock.authState.creds.registered && !codeRequested) {
                setTimeout(async () => {
                    try {
                        if (userState[userId] === 'PROCESSING' && !codeRequested) {
                            codeRequested = true;
                            let code = await waSock.requestPairingCode(phoneNumber);
                            code = code?.match(/.{1,4}/g)?.join("-") || code;

                            await ctx.reply(
                                `✅ <b>Your Pairing Code:</b>\n\n<code>${code}</code>\n\n👉 <i>Tap on the code to copy it instantly!</i>\nEnter this in WhatsApp Linked Devices.\n\n⚠️ If code expires, tap <b>🔄 Get New Code</b> below.`,
                                {
                                    parse_mode: 'HTML',
                                    ...Markup.inlineKeyboard([
                                        [Markup.button.callback('🔄 Get New Code', 'request_new_code')],
                                        [Markup.button.callback('🛑 Stop Service', 'stop_process')]
                                    ])
                                }
                            );
                        }
                    } catch (err) {
                        ctx.reply(`❌ Failed to request code: ${err.message}\nTap below to retry.`, Markup.inlineKeyboard([
                            [Markup.button.callback('🔄 Try Again', 'request_new_code')],
                            [Markup.button.callback('🛑 Stop Service', 'stop_process')]
                        ]));
      
