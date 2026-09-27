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

// ==========================================
// 3. REPLY KEYBOARD & MENUS
// ==========================================
const langData = {
    en: { 
        help_text: "📖 **How to use this Bot:**\n\n1. Click on **Login Account**.\n2. Send your WhatsApp number with country code (e.g., 919876XXXXX).\n3. You will receive an 8-digit Pairing Code.\n4. Enter this code in your linked WhatsApp devices.\n5. Once connected, use **Create Group** to automate your tasks!\n\n⚠️ *VIP is required for unlimited usage.*"
    }
};

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
    } catch (e) { console.log("Log send failed:", e.message); }
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
// 5. BOT CORE LOGIC & BUSY LOCK
// ==========================================
const userState = {};
const spamTracker = {};

bot.use(async (ctx, next) => {
    if (ctx.from) {
        const id = ctx.from.id;
        
        if (userState[id] === 'PROCESSING') {
            const warningMsg = '⏳ Service is currently running! Please wait or click the Stop button below[span_1](start_span)[span_1](end_span).';
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery(warningMsg, { show_alert: true }).catch(()=>{});
            } else if (ctx.message) {
                await ctx.reply(warningMsg, Markup.inlineKeyboard([
                    [Markup.button.callback('🛑 Stop Service', 'stop_process')]
                ])).catch(()=>{});
            }
            return; 
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

bot.action('stop_process', async (ctx) => {
    const userId = ctx.from.id;
    if (activeSockets[userId]) {
        try { activeSockets[userId].end(new Error("Stopped by user")); } catch(e){}
        delete activeSockets[userId];
    }
    userState[userId] = null;
    ctx.editMessageText("🛑 **Service Stopped Successfully.**\nYou can start a new action from the menu.", { parse_mode: 'Markdown' });
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
    showMainMenu(ctx);
});

bot.action('check_sub', async (ctx) => {
    const subscribed = await isSubscribed(ctx);
    if (subscribed) {
        ctx.answerCbQuery('✅ Verification Successful!');
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
        }
        ctx.reply("🏠 **Main Menu**\nSelect an option:", getReplyKeyboard());
    } catch (e) { console.log(e); }
}

// REPLY KEYBOARD TEXT HANDLERS
bot.hears('📱 Login Account', async (ctx) => {
    userState[ctx.from.id] = 'WAITING_NUMBER';
    ctx.reply("📱 Send your WhatsApp number with country code (e.g., 919876XXXXX):", Markup.inlineKeyboard([
        [Markup.button.callback('🛑 Cancel', 'stop_process')]
    ]));
});

bot.hears('📊 Status', async (ctx) => {
    const user = await User.findOne({ user_id: ctx.from.id });
    if (!user || !user.is_connected) {
        return ctx.reply("⚠️ **Action Required:** You haven't linked your WhatsApp account yet. Please click **Login Account** first.", { parse_mode: 'Markdown' });
    }
    ctx.reply("📊 Your WhatsApp account is active and connected!");
});

bot.hears(['➕ Create Group', '🗑️ Remove Members', '✏️ Edit Group'], async (ctx) => {
    const user = await User.findOne({ user_id: ctx.from.id });
    if (!user || !user.is_connected) {
        return ctx.reply("⚠️ **Action Required:** Please link your WhatsApp account first using **Login Account**.", { parse_mode: 'Markdown' });
    }
    ctx.reply("🚀 Service is ready for execution.");
});

bot.hears('⚙️ Settings', (ctx) => ctx.reply("⚙️ Settings panel options."));
bot.hears('💎 Buy VIP', (ctx) => ctx.reply("💎 Contact admin @egofiremax to buy VIP access."));
bot.hears('❓ Help', (ctx) => ctx.reply(langData['en'].help_text, { parse_mode: 'Markdown' }));

// ==========================================
// 6. ADD VIP COMMAND (/addvip)
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
// 7. WHATSAPP ENGINE (AUTO-RETRY & STABLE SOCKET)
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

bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    const userId = ctx.from.id;

    if (text.startsWith('/')) return;
    if (['📱 Login Account', '📊 Status', '➕ Create Group', '🗑️ Remove Members', '✏️ Edit Group', '⚙️ Settings', '💎 Buy VIP', '❓ Help'].includes(text)) return;

    if (userState[userId] === 'WAITING_NUMBER') {
        const phoneRegex = /^\+?[0-9]{10,15}$/;
        if (!phoneRegex.test(text)) {
            return ctx.reply("❌ Invalid format! Please send only numbers (e.g., 919876XXXXX).");
        }
        
        const phoneNumber = text.replace('+', '');
        userState[userId] = 'PROCESSING'; 
        
        const sessionPath = `./auth_info_${userId}`;
        deleteFolderRecursive(sessionPath);
        
        await ctx.reply(`⏳ Requesting WhatsApp pairing code for **${phoneNumber}**...`, Markup.inlineKeyboard([
            [Markup.button.callback('🛑 Stop Service', 'stop_process')]
        ]));

        let attempts = 0;
        let success = false;

        async function runAutoRetryLogin() {
            while (attempts < 3 && !success) {
                attempts++;
                if (attempts > 1) {
                    await ctx.reply(`⚠️ Previous Code Expired or Failed!\n\n🔄 Automatically requesting a fresh pairing code (Attempt ${attempts}/3)...`);
                    deleteFolderRecursive(sessionPath);
                }

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

                    let codeRequested = false;

                    const connected = await new Promise((resolve, reject) => {
                        waSock.ev.on("connection.update", (update) => {
                            const { connection } = update;
                            if (connection === 'open') {
                                resolve(true);
                            }
                        });

                        setTimeout(async () => {
                            try {
                                if (!codeRequested && !success) {
                                    codeRequested = true;
                                    let code = await waSock.requestPairingCode(phoneNumber);
                                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                                    
                                    await ctx.reply(`✅ **Your Pairing Code:**\n\n\`${code}\`\n\n_Enter this in your linked devices menu on WhatsApp._`, Markup.inlineKeyboard([
                                        [Markup.button.callback('🛑 Stop Service', 'stop_process')]
                                    ]));
                                }
                            } catch (e) {
                                reject(e);
                            }
                        }, 3000);

                        // 40 seconds timeout for manual code entry per attempt
                        setTimeout(() => {
                            if (!success) {
                                reject(new Error("Timeout/Code Expired"));
                            }
                        }, 40000);
                    });

                    if (connected) {
                        success = true;
                    }
                } catch (err) {
                    if (attempts >= 3) {
                        throw new Error("Max retry attempts reached. Connection failed.");
                    }
                }
            }
        }

        try {
            await runAutoRetryLogin();

            if (activeSockets[userId]) {
                delete activeSockets[userId];
            }
            userState[userId] = null;

            sendLog(`🔑 <b>WHATSAPP LOGIN SUCCESSFUL</b>\n\n👤 User: ${formatUserForLog(ctx.from)}\n📞 Number: <code>${phoneNumber}</code>\n⏱ Time: ${getFormattedTime()}`);
            await ctx.reply(`✅ **WhatsApp Account Linked Successfully!**`, { parse_mode: 'Markdown' });
            await User.updateOne({ user_id: userId }, { $set: { is_connected: true },$addToSet: { phone_numbers: phoneNumber } });
            showMainMenu(ctx);

        } catch (error) {
            if (activeSockets[userId]) {
                try { activeSockets[userId].end(new Error("Failed")); } catch(e){}
                delete activeSockets[userId];
            }
            userState[userId] = null;
            
            sendLog(`❌ <b>WHATSAPP LOGIN FAILED</b>\n\n👤 User: ${formatUserForLog(ctx.from)}\n📞 Number: <code>${phoneNumber}</code>\n⏱ Time: ${getFormattedTime()}`);
            await ctx.reply(`❌ **Login Failed / Cancelled.** Please try again from the menu.`, { parse_mode: 'Markdown' });
            showMainMenu(ctx);
        }
    }
});

bot.launch();
console.log('Master Bot Started...');
