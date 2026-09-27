const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. SERVER, HTML & CONFIGURATION
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

const TG_BOT_TOKEN = '8992778279:AAHH7zvVcF3Oh1_KA3QR5Q_qRG7eEA6t02c'; // Aapka Token
const ADMIN_ID = 7959829014;
const ADMIN_USERNAME = 'egofiremax';
const LOG_CHANNEL = '@data5k';
const FORCE_SUB_CHAT_ID = '@ai2kmm';
const FORCE_SUB_LINK = 'https://t.me/ai2kmm';

const bot = new Telegraf(TG_BOT_TOKEN);

// ==========================================
// 2. DATABASE & SCHEMAS (MONGODB)
// ==========================================
const MONGODB_URI = process.env.MONGODB_URI; 
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI).then(() => {
        console.log('MongoDB Connected');
    }).catch(err => console.log(err));
}

const UserSchema = new mongoose.Schema({
    user_id: Number,
    username: String,
    language: { type: String, default: 'en' },
    is_vip: { type: Number, default: 0 },
    vip_expiry: { type: Number, default: 0 }, 
    joined_at: { type: Date, default: Date.now },
    phone_numbers: [String] 
});
const User = mongoose.model('User', UserSchema);

// ==========================================
// 3. MULTI-LANGUAGE DATA & HELP MENU
// ==========================================
const langData = {
    en: { 
        menu: "🏠 **Main Menu**\nSelect an option:", 
        btn_login: "📱 Login Account", btn_status: "📊 Status", btn_create: "➕ Create Group", btn_remove: "🗑️ Remove Members", btn_edit: "✏️ Edit Group", btn_settings: "⚙️ Settings", btn_lang: "🌐 Change Lang", btn_vip: "💎 Buy VIP", btn_help: "❓ Help",
        help_text: "📖 **How to use this Bot:**\n\n1. Click on **Login Account**.\n2. Send your WhatsApp number with country code (e.g., 919876XXXXX).\n3. You will receive an 8-digit Pairing Code.\n4. Enter this code in your linked WhatsApp devices.\n5. Once connected, use **Create Group** to automate your tasks!\n\n⚠️ *VIP is required for unlimited usage.*"
    },
    id: { 
        menu: "🏠 **Menu Utama**\nPilih opsi:", 
        btn_login: "📱 Masuk Akun", btn_status: "📊 Status", btn_create: "➕ Buat Grup", btn_remove: "🗑️ Hapus Anggota", btn_edit: "✏️ Edit Grup", btn_settings: "⚙️ Pengaturan", btn_lang: "🌐 Ganti Bahasa", btn_vip: "💎 Beli VIP", btn_help: "❓ Bantuan",
        help_text: "📖 **Cara menggunakan Bot ini:**\n\n1. Klik **Masuk Akun**.\n2. Kirim nomor WhatsApp Anda (contoh: 628123XXXXX).\n3. Dapatkan Kode Pemasangan 8 digit.\n4. Masukkan kode di WhatsApp Anda.\n5. Gunakan **Buat Grup** untuk otomatisasi!\n\n⚠️ *Akses VIP diperlukan untuk tanpa batas.*"
    },
    zh: { 
        menu: "🏠 **主菜单**\n选择一个选项：", 
        btn_login: "📱 登录账号", btn_status: "📊 状态", btn_create: "➕ 创建群组", btn_remove: "🗑️ 删除成员", btn_edit: "✏️ 编辑群组", btn_settings: "⚙️ 设置", btn_lang: "🌐 更改语言", btn_vip: "💎 购买 VIP", btn_help: "❓ 帮助",
        help_text: "📖 **如何使用此机器人:**\n\n1. 点击 **登录账号**。\n2. 发送带国家代码的WhatsApp号码。\n3. 获取8位配对码。\n4. 在您的WhatsApp中输入此代码。\n5. 使用 **创建群组** 自动执行任务！\n\n⚠️ *无限制使用需要VIP。*"
    }
};

function getMainMenu(lang) {
    const t = langData[lang] || langData['en'];
    return Markup.inlineKeyboard([
        [Markup.button.callback(t.btn_login, 'menu_login'), Markup.button.callback(t.btn_create, 'menu_create')],
        [Markup.button.callback(t.btn_edit, 'menu_edit'), Markup.button.callback(t.btn_remove, 'menu_remove')],
        [Markup.button.callback(t.btn_status, 'menu_status'), Markup.button.callback(t.btn_settings, 'menu_settings')],
        [Markup.button.callback(t.btn_vip, 'buy_vip'), Markup.button.callback(t.btn_help, 'menu_help')],
        [Markup.button.callback(t.btn_lang, 'change_lang')]
    ]);
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
    sendLog(`⚙️ <b>SYSTEM HEARTBEAT</b>\n\n⏱ Time: ${time} (IST)\n✅ All group maker services, MongoDB, and WhatsApp Engines are running smoothly.`);
}, 5 * 60 * 60 * 1000);

function getFormattedTime() {
    return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function formatUserForLog(fromObj) {
    const usernameStr = fromObj.username ? `@${fromObj.username}` : 'NoUsername';
    return `${usernameStr} (<code>${fromObj.id}</code>)`;
}

// ==========================================
// 5. BOT CORE LOGIC, ANTI-SPAM & BUSY LOCK
// ==========================================
const userState = {};
const spamTracker = {};

bot.use(async (ctx, next) => {
    if (ctx.from) {
        const id = ctx.from.id;
        
        // 1. Busy/Processing Lock
        if (userState[id] === 'PROCESSING') {
            const warningMsg = '⏳ Please wait, your previous request is still processing...';
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery(warningMsg, { show_alert: true }).catch(()=>{});
            } else if (ctx.message) {
                await ctx.reply(warningMsg).catch(()=>{});
            }
            return; 
        }

        // 2. Anti Spam Tracker
        const now = Date.now();
        if (!spamTracker[id]) spamTracker[id] = [];
        spamTracker[id].push(now);
        spamTracker[id] = spamTracker[id].filter(time => now - time < 3000); 
        
        if (spamTracker[id].length > 5) {
            if (spamTracker[id].length === 6) { 
                sendLog(`⚠️ <b>SPAM ALERT!</b>\n\n👤 User: ${formatUserForLog(ctx.from)}\n⏱ Time: ${getFormattedTime()}\n🚨 Action: Flooding the bot.`);
            }
            return; 
        }
    }
    return next();
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
            
            sendLog(`🎉 <b>NEW USER JOINED!</b>\n\n👤 User: ${formatUserForLog(ctx.from)}\n⏱ Time: ${getFormattedTime()}\n🎁 Status: 1 Day Free Trial Activated.`);
            
            return ctx.reply("🎉 Welcome! Select language:", Markup.inlineKeyboard([
                [Markup.button.callback('🇬🇧 English', 'lang_en'), Markup.button.callback('🇮🇩 Indo', 'lang_id'), Markup.button.callback('🇨🇳 中文', 'lang_zh')]
            ]));
        }
        const userLang = user.language || 'en';
        ctx.reply(langData[userLang].menu, getMainMenu(userLang));
    } catch (e) { console.log(e); }
}

bot.action(/lang_(.+)/, async (ctx) => {
    const lang = ctx.match[1];
    await User.findOneAndUpdate({ user_id: ctx.from.id }, { language: lang });
    ctx.editMessageText("✅ Language saved.\n\n" + langData[lang].menu, getMainMenu(lang));
});

bot.action('menu_help', async (ctx) => {
    const user = await User.findOne({ user_id: ctx.from.id });
    const lang = user ? user.language : 'en';
    ctx.reply(langData[lang].help_text, { parse_mode: 'Markdown' });
    ctx.answerCbQuery();
});

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
    
    const user = await User.findOneAndUpdate(
        { user_id: targetId },
        { is_vip: 1, vip_expiry: expiryTime },
        { new: true }
    );
    
    if (user) {
        ctx.reply(`✅ Successfully added VIP to ${targetId} for ${days} days.`);
        sendLog(`💎 <b>VIP ACTIVATED (By Admin)</b>\n\n👤 Target ID: <code>${targetId}</code>\n⏱ Activated At: ${getFormattedTime()}\n⏳ Duration: ${days} Days\n📅 Valid until: ${new Date(expiryTime * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
        bot.telegram.sendMessage(targetId, `🎉 Congratulations! Your VIP access has been activated for ${days} days!`).catch(()=>{});
    } else {
        ctx.reply("❌ User not found in database.");
    }
});

// ==========================================
// 7. WHATSAPP ENGINE (AUTO-RETRY & CLEAN SESSION)
// ==========================================
bot.action('menu_login', (ctx) => {
    userState[ctx.from.id] = 'WAITING_NUMBER';
    ctx.reply("📱 Send your WhatsApp number with country code (e.g., 919876XXXXX):");
    ctx.answerCbQuery();
});

// Function to clean dirty session before requesting code
function deleteFolderRecursive(directoryPath) {
    if (fs.existsSync(directoryPath)) {
        fs.readdirSync(directoryPath).forEach((file, index) => {
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

    if (userState[userId] === 'WAITING_NUMBER') {
        const phoneRegex = /^\+?[0-9]{10,15}$/;
        if (!phoneRegex.test(text)) {
            return ctx.reply("❌ Invalid format! Please send only numbers (e.g., 919876XXXXX).");
        }
        
        const phoneNumber = text.replace('+', '');
        
        // LOCK THE STATE TO PROCESSING
        userState[userId] = 'PROCESSING'; 
        
        // 1 Minute Failsafe to unlock state
        const failSafeUnlock = setTimeout(() => {
            if (userState[userId] === 'PROCESSING') userState[userId] = null;
        }, 60000); 
        
        // DELETE OLD DIRTY SESSION TO FIX "Couldn't link device" ERROR
        const sessionPath = `./auth_info_${userId}`;
        deleteFolderRecursive(sessionPath);
        
        await ctx.reply(`⏳ Requesting WhatsApp pairing code for **${phoneNumber}**...\n\n*(System is communicating with WhatsApp, please wait up to 10 seconds...)*`, {parse_mode: 'Markdown'});
        
        let attempts = 0;
        let success = false;

        async function requestPairingCodeWithRetry() {
            try {
                if(attempts > 0) {
                   await ctx.reply(`⚠️ Code Expired or Timeout!\n\n🔄 Fetching a new fresh code for **${phoneNumber}**, please wait...`, {parse_mode: 'Markdown'});
                   deleteFolderRecursive(sessionPath); // Clean again before retry
                }

                attempts++;
                const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
                const { version } = await fetchLatestBaileysVersion();
                
                const waSock = makeWASocket({
                    version,
                    printQRInTerminal: false,
                    auth: state,
                    logger: pino({ level: "silent" }),
                    browser: ["Mac OS", "Chrome", "10.0.0"]
                });
                
                waSock.ev.on("creds.update", saveCreds);
                
                return new Promise((resolve, reject) => {
                    let isResolved = false;
                    
                    // Timeout handling for code expiry (15 seconds)
                    const timeout = setTimeout(() => {
                        if (!isResolved) reject(new Error("Timeout/Code Expired"));
                    }, 15000); 

                    setTimeout(async () => {
                        try {
                            if(isResolved) return;
                            let code = await waSock.requestPairingCode(phoneNumber);
                            code = code?.match(/.{1,4}/g)?.join("-") || code;
                            isResolved = true;
                            clearTimeout(timeout);
                            resolve(code);
                        } catch (e) {
                            if(!isResolved) {
                                isResolved = true;
                                clearTimeout(timeout);
                                reject(e);
                            }
                        }
                    }, 3000);
                });
            } catch (error) {
                throw error;
            }
        }

        async function executeCodeFlow() {
            while (attempts < 2 && !success) {
                try {
                    const code = await requestPairingCodeWithRetry();
                    
                    // LOG ONLY ON SUCCESS WITH PROFESSIONAL FORMAT
                    sendLog(`🔑 <b>WHATSAPP LOGIN SUCCESS</b>\n\n👤 User: ${formatUserForLog(ctx.from)}\n📞 Number: <code>${phoneNumber}</code>\n⏱ Time: ${getFormattedTime()}\n✅ Action: 8-Digit Pairing Code Generated Successfully.`);
                    
                    ctx.reply(`✅ **Your Pairing Code:**\n\n\`${code}\`\n\n_Enter this in your linked devices menu on WhatsApp._`, {parse_mode: 'Markdown'});
                    
                    await User.updateOne({ user_id: userId }, { $addToSet: { phone_numbers: phoneNumber } });
                    success = true;
                } catch (error) {
                     if (attempts >= 2 || (error.message !== "Timeout/Code Expired" && !error.message.includes("Timeout"))) {
                        sendLog(`❌ <b>WHATSAPP LOGIN FAILED</b>\n\n👤 User: ${formatUserForLog(ctx.from)}\n📞 Number: <code>${phoneNumber}</code>\n⏱ Time: ${getFormattedTime()}\n⚠️ Error: ${error.message}`);
                        ctx.reply("❌ Failed to generate code after retries. Ensure the number is registered on WhatsApp and try again.");
                        break;
                     }
                }
            }
            
            clearTimeout(failSafeUnlock);
            userState[userId] = null; // UNLOCK
        }

        executeCodeFlow();
    }
});

bot.launch();
console.log('Master Bot Started...');
