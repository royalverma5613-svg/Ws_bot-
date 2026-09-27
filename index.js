const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const https = require('https');

// 1. SERVER & CONFIG
const app = express();
app.get('/', (req, res) => res.send('<h1>Ws_gc_2xbot Master Engine Live</h1>'));
app.listen(process.env.PORT || 3000);

const TG_BOT_TOKEN = '8992778279:AAHH7zvVcF3Oh1_KA3QR5Q_qRG7eEA6t02c';
const ADMIN_ID = 7959829014;
const ADMIN_USERNAME = 'egofiremax';
const LOG_CHANNEL = '@data5k';
const FORCE_SUB_CHAT = '@ai2kmm';
const FORCE_SUB_LINK = 'https://t.me/ai2kmm';
const bot = new Telegraf(TG_BOT_TOKEN);

const BOT_FOOTER = "\n\n👑 <b>Bot Owner:</b> @egofiremax\n🤖 <b>Bot Username:</b> @Ws_gc_2xbot";

if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI).catch(e => console.log('DB:', e.message));
}

const User = mongoose.model('User', new mongoose.Schema({
    user_id: Number, username: String, language: { type: String, default: 'en' },
    is_vip: { type: Number, default: 0 }, vip_expiry: { type: Number, default: 0 },
    phone_numbers: [String], main_number: String, is_connected: { type: Boolean, default: false }
}));

const activeSockets = {}, userPhoneNumbers = {}, userState = {}, groupWizard = {};
const removeSelection = {}, editGroupSelection = {}, copyLinkSelection = {}, spamTracker = {};
const getFormattedTime = () => new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

async function sendLog(msg) {
    try { await bot.telegram.sendMessage(LOG_CHANNEL, msg, { parse_mode: 'HTML', disable_web_page_preview: true }); } catch (e) {}
}
setInterval(() => {
    sendLog(`⚙️ <b>SYSTEM HEARTBEAT</b>\n\n⏱ Time: ${getFormattedTime()} (IST)\n✅ Engine is Live.`);
}, 5 * 60 * 60 * 1000);

const getInlineMenu = () => Markup.inlineKeyboard([
    [Markup.button.callback('📊 Status', 'menu_status'), Markup.button.callback('➕ Create Group', 'menu_create')],
    [Markup.button.callback('📋 Copy GC Links', 'menu_copy_links'), Markup.button.callback('🗑️ Remove Members', 'menu_remove')],
    [Markup.button.callback('✏️ Edit Group', 'menu_edit'), Markup.button.callback('⚙️ Settings', 'menu_settings')],
    [Markup.button.callback('📱 Login Account', 'menu_login'), Markup.button.callback('💎 Buy VIP', 'buy_vip')],
    [Markup.button.callback('❓ Help', 'menu_help'), Markup.button.callback('🌐 Language', 'change_lang')]
]);

const getReplyKeyboard = () => Markup.keyboard([
    ['📊 Status', '➕ Create Group'],
    ['📋 Copy GC Links', '🗑️ Remove Members'],
    ['✏️ Edit Group', '⚙️ Settings'],
    ['📱 Login Account', '💎 Buy VIP', '❓ Help']
]).resize();

function cleanFolder(dir) {
    try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
}
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// 2. MIDDLEWARE & SUB CHECK
bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    const id = ctx.from.id;
    if (userState[id] === 'PROCESSING') {
        if (ctx.callbackQuery && ['request_new_code', 'stop_process'].includes(ctx.callbackQuery.data)) return next();
        const kb = Markup.inlineKeyboard([[Markup.button.callback('🔄 Get New Code', 'request_new_code')], [Markup.button.callback('🛑 Stop Service', 'stop_process')]]);
        if (ctx.callbackQuery) await ctx.answerCbQuery('⏳ Processing in background...', { show_alert: true }).catch(()=>{});
        else if (ctx.message) await ctx.reply('⏳ Service active! Use buttons below:', kb).catch(()=>{});
        return;
    }
    const now = Date.now();
    if (!spamTracker[id]) spamTracker[id] = [];
    spamTracker[id].push(now);
    spamTracker[id] = spamTracker[id].filter(t => now - t < 3000);
    if (spamTracker[id].length > 5) return;
    return next();
});

async function checkSub(ctx) {
    try {
        const m = await ctx.telegram.getChatMember(FORCE_SUB_CHAT, ctx.from.id);
        return ['member', 'administrator', 'creator'].includes(m.status);
    } catch { return true; }
}

async function showHome(ctx) {
    let u = await User.findOne({ user_id: ctx.from.id });
    if (!u) {
        u = await User.create({ user_id: ctx.from.id, username: ctx.from.username || 'NoUsername', is_vip: 1, vip_expiry: Math.floor(Date.now() / 1000) + 86400 });
        sendLog(`🎉 <b>NEW USER JOINED!</b>\n\n👤 User: @${ctx.from.username || 'None'} (<code>${ctx.from.id}</code>)`);
    }
    await ctx.reply('⚡ Dashboard Menu:', getReplyKeyboard());
    await ctx.reply('🏠 <b>Main Menu</b>\nSelect an option below:', { parse_mode: 'HTML', ...getInlineMenu() });
}

bot.command('start', async (ctx) => {
    userState[ctx.from.id] = null;
    if (!(await checkSub(ctx))) {
        return ctx.reply('⚠️ Join our channel to use this bot.', Markup.inlineKeyboard([[Markup.button.url('🔔 Join', FORCE_SUB_LINK)], [Markup.button.callback('✅ Verify', 'check_sub')]]));
    }
    showHome(ctx);
});

bot.action('check_sub', async (ctx) => {
    if (await checkSub(ctx)) { await ctx.answerCbQuery('✅ Verified!'); showHome(ctx); }
    else { await ctx.answerCbQuery('❌ You have not joined yet!', { show_alert: true }); }
});

bot.action('stop_process', async (ctx) => {
    const id = ctx.from.id;
    if (activeSockets[id]) { try { activeSockets[id].end(undefined); } catch {} delete activeSockets[id]; }
    const phone = userPhoneNumbers[id];
    if (phone) cleanFolder(`./auth_info_${id}_${phone}`);
    userState[id] = null; delete userPhoneNumbers[id]; delete groupWizard[id];
    delete removeSelection[id]; delete editGroupSelection[id]; delete copyLinkSelection[id];
    await ctx.answerCbQuery('Stopped').catch(()=>{});
    await ctx.reply('🛑 <b>Service Stopped Successfully.</b>' + BOT_FOOTER, { parse_mode: 'HTML' });
    showHome(ctx);
});

bot.action('change_lang', (ctx) => {
    ctx.editMessageText("🌐 <b>Select your language:</b>", {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🇬🇧 English', 'set_lang_en')],
            [Markup.button.callback('🇮🇩 Bahasa Indonesia', 'set_lang_id')],
            [Markup.button.callback('🇨🇳 中文 (Chinese)', 'set_lang_zh')]
        ])
    });
});
bot.action(/set_lang_(.+)/, async (ctx) => {
    await User.findOneAndUpdate({ user_id: ctx.from.id }, { language: ctx.match[1] });
    await ctx.answerCbQuery('Language Saved!');
    ctx.editMessageText('✅ <b>Language set successfully!</b>\n\n🏠 <b>Main Menu</b>\nSelect an option:', { parse_mode: 'HTML', ...getInlineMenu() });
});

bot.action('buy_vip', (ctx) => { ctx.answerCbQuery(); ctx.reply('💎 <b>VIP Plans:</b>\n\nContact Admin @egofiremax to activate VIP.' + BOT_FOOTER, { parse_mode: 'HTML' }); });
bot.action('menu_help', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply('📖 <b>How to Use:</b>\n\n1. <b>Login:</b> Pair WhatsApp via 8-digit code.\n2. <b>Status:</b> Manage accounts.\n3. <b>Create Group:</b> Batch group creator.\n4. <b>Copy GC Links:</b> Extract invite links of existing groups.\n5. <b>Remove Members:</b> Kick non-admins from selected groups.' + BOT_FOOTER, { parse_mode: 'HTML' });
});
bot.hears('💎 Buy VIP', (ctx) => ctx.reply('💎 Contact @egofiremax for VIP access.' + BOT_FOOTER, { parse_mode: 'HTML' }));
bot.hears('❓ Help', (ctx) => ctx.reply('📖 Use <b>Login Account</b> to pair, <b>Create Group</b> to create, and <b>Copy GC Links</b> to extract links.' + BOT_FOOTER, { parse_mode: 'HTML' }));
bot.hears('⚙️ Settings', (ctx) => ctx.reply('⚙️ Use <b>Language</b> or <b>Status</b> menu to configure settings.' + BOT_FOOTER, { parse_mode: 'HTML' }));

// 3. STATUS PANEL
async function showUserStatus(ctx) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    const u = await User.findOne({ user_id: ctx.from.id });
    if (!u || !u.phone_numbers || u.phone_numbers.length === 0) {
        return ctx.reply("⚠️ <b>Action Required:</b> No WhatsApp account linked yet. Please click <b>Login Account</b> first." + BOT_FOOTER, { parse_mode: 'HTML' });
    }
    const mainNum = u.main_number || u.phone_numbers[0];
    let accountsText = '📱 <b>Active Accounts:</b>\n';
    const inlineButtons = [];

    u.phone_numbers.forEach(num => {
        const isMain = (num === mainNum);
        accountsText += `${isMain ? '🟢' : '⚪'} +${num} ${isMain ? '<b>(Main)</b>' : ''}\n`;
        const row = [];
        if (!isMain) row.push(Markup.button.callback(`🔄 Set +${num} as Main`, `set_main_${num}`));
        row.push(Markup.button.callback(`❌ Logout +${num}`, `logout_acc_${num}`));
        inlineButtons.push(row);
    });

    const isVip = u.is_vip && u.vip_expiry > Math.floor(Date.now() / 1000);
    const expiryDate = u.vip_expiry ? new Date(u.vip_expiry * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Expired';
    ctx.reply(`${accountsText}\n💎 <b>VIP:</b> ${isVip ? '✅ Active' : '❌ Inactive'}\n⏳ <b>Validity:</b> ${expiryDate}\n⚡ <b>Engine:</b> 🟢 Ready` + BOT_FOOTER, { parse_mode: 'HTML', ...Markup.inlineKeyboard(inlineButtons) });
}
bot.action('menu_status', showUserStatus);
bot.hears('📊 Status', showUserStatus);

bot.action(/set_main_(.+)/, async (ctx) => {
    await User.findOneAndUpdate({ user_id: ctx.from.id }, { main_number: ctx.match[1] });
    await ctx.answerCbQuery(`+${ctx.match[1]} set as Main!`);
    showUserStatus(ctx);
});

bot.action(/logout_acc_(.+)/, async (ctx) => {
    const target = ctx.match[1], id = ctx.from.id;
    cleanFolder(`./auth_info_${id}_${target}`);
    if (activeSockets[id]) { try { activeSockets[id].end(undefined); } catch {} delete activeSockets[id]; }
    const u = await User.findOne({ user_id: id });
    const updated = (u.phone_numbers || []).filter(n => n !== target);
    const newMain = (u.main_number === target) ? (updated[0] || null) : u.main_number;
    await User.findOneAndUpdate({ user_id: id }, { phone_numbers: updated, main_number: newMain, is_connected: updated.length > 0 });
    await ctx.answerCbQuery(`+${target} logged out.`);
    ctx.reply(`✅ <b>Account +${target} logged out.</b>` + BOT_FOOTER, { parse_mode: 'HTML' });
    showUserStatus(ctx);
});

// 4. LOGIN & PAIRING
function promptLogin(ctx) {
    userState[ctx.from.id] = 'WAITING_NUMBER';
    ctx.reply("Send your WhatsApp number with country code.\nExample: 919876543210", Markup.inlineKeyboard([[Markup.button.callback('🛑 Cancel', 'stop_process')]]));
}
bot.hears('📱 Login Account', promptLogin);
bot.action('menu_login', (ctx) => { ctx.answerCbQuery(); promptLogin(ctx); });

async function startWhatsAppPairing(userId, phone, ctx) {
    userState[userId] = 'PROCESSING';
    userPhoneNumbers[userId] = phone;
    const sessionDir = `./auth_info_${userId}_${phone}`;
    if (activeSockets[userId]) { try { activeSockets[userId].end(undefined); } catch {} delete activeSockets[userId]; }
    cleanFolder(sessionDir);

    await ctx.reply(`⏳ Requesting pairing code for <b>+${phone}</b>...`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🛑 Cancel', 'stop_process')]]) });

    let codeSent = false;
    async function initSocket() {
        if (userState[userId] !== 'PROCESSING') return;
        try {
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
            const { version } = await fetchLatestBaileysVersion();
            const logger = pino({ level: 'silent' });
            const sock = makeWASocket({
                version, printQRInTerminal: false, auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
                logger, browser: ['Ubuntu', 'Chrome', '20.0.0.0'], syncFullHistory: false, markOnlineOnConnect: true,
                connectTimeoutMs: 60000, defaultQueryTimeoutMs: 60000, keepAliveIntervalMs: 15000
            });
            activeSockets[userId] = sock;
            sock.ev.on('creds.update', saveCreds);
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;
                if (connection === 'close') {
                    const code = lastDisconnect?.error?.output?.statusCode;
                    if (code === 515 && userState[userId] === 'PROCESSING') initSocket();
                    else if (code === DisconnectReason.loggedOut) {
                        cleanFolder(sessionDir); userState[userId] = null; ctx.reply('❌ Device logged out. Please link again.' + BOT_FOOTER, { parse_mode: 'HTML' });
                    }
                }
                if (connection === 'open') {
                    userState[userId] = null; delete userPhoneNumbers[userId];
                    sendLog(`🔑 <b>WHATSAPP LOGIN SUCCESS</b>\n\n👤 User: @${ctx.from.username || 'None'} (<code>${userId}</code>)\n📞 <code>+${phone}</code>`);
                    await ctx.reply('✅ <b>WhatsApp Account Linked Successfully!</b>\nYou can now create groups.' + BOT_FOOTER, { parse_mode: 'HTML' });
                    const u = await User.findOne({ user_id: userId });
                    const mainNum = u.main_number || phone;
                    await User.updateOne({ user_id: userId }, { $set: { is_connected: true, main_number: mainNum },$addToSet: { phone_numbers: phone } });
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
                            await ctx.reply(`Your pairing code is:\n\n<code>${c}</code>\n\nEnter this in linked devices.`, {
                                parse_mode: 'HTML',
                                ...Markup.inlineKeyboard([[Markup.button.callback('🔄 Get New Code', 'request_new_code')], [Markup.button.callback('🛑 Stop Service', 'stop_process')]])
                            });
                        }
                    } catch (e) {
                        ctx.reply(`❌ Could not generate code: ${e.message}`, Markup.inlineKeyboard([[Markup.button.callback('🔄 Try Again', 'request_new_code')], [Markup.button.callback('🛑 Stop Service', 'stop_process')]]));
                    }
                }, 3500);
            }
        } catch (e) { console.log('Init Err:', e.message); }
    }
    initSocket();
}

bot.action('request_new_code', async (ctx) => {
    const id = ctx.from.id, phone = userPhoneNumbers[id];
    if (!phone) { await ctx.answerCbQuery('⚠️ Session expired.'); userState[id] = null; return promptLogin(ctx); }
    await ctx.answerCbQuery('🔄 Requesting new code...').catch(()=>{});
    await ctx.reply('🔄 Clearing session & requesting fresh code from WhatsApp...');
    startWhatsAppPairing(id, phone, ctx);
});

// 5. ACTIVE SOCKET LOADER
async function getActiveWASocket(userId) {
    if (activeSockets[userId]) return activeSockets[userId];
    const u = await User.findOne({ user_id: userId });
    if (!u || !u.phone_numbers || u.phone_numbers.length === 0) return null;
    const phone = u.main_number || u.phone_numbers[0];
    const sessionDir = `./auth_info_${userId}_${phone}`;
    if (!fs.existsSync(sessionDir)) return null;
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        const logger = pino({ level: 'silent' });
        const sock = makeWASocket({
            version, printQRInTerminal: false, auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
            logger, browser: ['Ubuntu', 'Chrome', '20.0.0.0'], syncFullHistory: false
        });
        sock.ev.on('creds.update', saveCreds);
        activeSockets[userId] = sock;
        return sock;
    } catch (e) { return null; }
}

// 6. PERMISSIONS KEYBOARD
function getPermissionsKeyboard(perms, prefix = 'perm') {
    return Markup.inlineKeyboard([
        [Markup.button.callback(`✏️ Edit group settings: ${perms.editSettings ? '🔓 All' : '🔒 Admins'}`, `${prefix}_toggle_editSettings`)],
        [Markup.button.callback(`💬 Send new messages: ${perms.sendMessages ? '🟢 ON' : '🔴 OFF'}`, `${prefix}_toggle_sendMessages`)],
        [Markup.button.callback(`👥 Add other members: ${perms.addMembers ? '🟢 ON' : '🔴 OFF'}`, `${prefix}_toggle_addMembers`)],
        [Markup.button.callback(`🛡️ Approve new members: ${perms.approveMembers ? '🟢 ON' : '⚪ OFF'}`, `${prefix}_toggle_approveMembers`)],
        [Markup.button.callback('🚀 Confirm & Apply Settings', `${prefix}_confirm`)],
        [Markup.button.callback('🛑 Cancel', 'stop_process')]
    ]);
}

// 7. CREATE GROUP WIZARD (WITH MEMBER ADD STEP & SKIP)
async function initiateCreateGroup(ctx) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    const u = await User.findOne({ user_id: ctx.from.id });
    if (!u || !u.is_connected || !u.phone_numbers || u.phone_numbers.length === 0) {
        return ctx.reply("⚠️ <b>Action Required:</b> Please link your WhatsApp account first via <b>Login Account</b>." + BOT_FOOTER, { parse_mode: 'HTML' });
    }
    userState[ctx.from.id] = 'WIZARD_COUNT';
    groupWizard[ctx.from.id] = { 
        perms: { editSettings: false, sendMessages: true, addMembers: false, approveMembers: false },
        participants: []
    };
    ctx.reply("Enter number of groups to create (1-50):", Markup.inlineKeyboard([[Markup.button.callback('🛑 Cancel', 'stop_process')]]));
}
bot.action('menu_create', initiateCreateGroup);
bot.hears('➕ Create Group', initiateCreateGroup);

bot.action('skip_desc', async (ctx) => {
    const id = ctx.from.id;
    if (userState[id] !== 'WIZARD_DESC') return;
    await ctx.answerCbQuery('Skipped');
    groupWizard[id].desc = ''; userState[id] = 'WIZARD_PHOTO';
    ctx.reply("Send profile photo or tap Skip.", Markup.inlineKeyboard([[Markup.button.callback('⏭️ Skip', 'skip_photo')], [Markup.button.callback('🛑 Cancel', 'stop_process')]]));
});

bot.action('skip_photo', async (ctx) => {
    const id = ctx.from.id;
    if (userState[id] !== 'WIZARD_PHOTO') return;
    await ctx.answerCbQuery('Skipped');
    groupWizard[id].photoBuffer = null;
    promptParticipantsStep(ctx, id);
});

function promptParticipantsStep(ctx, id) {
    userState[id] = 'WIZARD_MEMBERS';
    const text = "👥 Send phone numbers to add with country code (separated by comma, e.g., <code>919876543210, 918765432109</code>) or tap Skip:";
    const kb = Markup.inlineKeyboard([[Markup.button.callback('⏭️ Skip', 'skip_members')], [Markup.button.callback('🛑 Cancel', 'stop_process')]]);
    if (ctx.callbackQuery) ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
    else ctx.reply(text, { parse_mode: 'HTML', ...kb });
}

bot.action('skip_members', async (ctx) => {
    const id = ctx.from.id;
    if (userState[id] !== 'WIZARD_MEMBERS') return;
    await ctx.answerCbQuery('Members Skipped');
    groupWizard[id].participants = [];
    showPermissionsWizard(ctx, id);
});

function showPermissionsWizard(ctx, id) {
    userState[id] = 'WIZARD_PERMISSIONS';
    const text = '⚙️ <b>Group Permissions Setup</b>\n\nConfigure permissions matching WhatsApp settings:';
    const kb = getPermissionsKeyboard(groupWizard[id].perms, 'perm');
    if (ctx.callbackQuery) ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
    else ctx.reply(text, { parse_mode: 'HTML', ...kb });
}

bot.action(/perm_toggle_(.+)/, async (ctx) => {
    const id = ctx.from.id;
    if (userState[id] !== 'WIZARD_PERMISSIONS') return;
    groupWizard[id].perms[ctx.match[1]] = !groupWizard[id].perms[ctx.match[1]];
    await ctx.answerCbQuery('Toggled');
    ctx.editMessageText('⚙️ <b>Group Permissions Setup</b>\n\nConfigure permissions matching WhatsApp settings:', {
        parse_mode: 'HTML', ...getPermissionsKeyboard(groupWizard[id].perms, 'perm')
    });
});

bot.action('perm_confirm', async (ctx) => {
    const id = ctx.from.id;
    if (userState[id] !== 'WIZARD_PERMISSIONS') return;
    await ctx.answerCbQuery('Confirmed');
    executeBatchGroupCreation(ctx, id);
});

function downloadFileBuffer(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const data = []; res.on('data', chunk => data.push(chunk));
            res.on('end', () => resolve(Buffer.concat(data)));
            res.on('error', err => reject(err));
        });
    });
}

async function executeBatchGroupCreation(ctx, id) {
    const wizard = groupWizard[id];
    userState[id] = 'PROCESSING';
    const { count, baseName, startNum, desc, photoBuffer, perms, participants } = wizard;
    const sock = await getActiveWASocket(id);
    if (!sock) {
        userState[id] = null; delete groupWizard[id];
        return ctx.reply("❌ WhatsApp session disconnected. Please reconnect via <b>Login Account</b>." + BOT_FOOTER, { parse_mode: 'HTML' });
    }

    let progressMsg = await ctx.reply(`⏳ 0/${count} groups created...`).catch(()=>null);
    let successCount = 0, failCount = 0;
    const groupResults = [];

    for (let i = 0; i < count; i++) {
        const groupTitle = `${baseName} ${startNum + i}`.trim();
        try {
            const group = await sock.groupCreate(groupTitle, participants || []);
            const gid = group.id;
            if (desc) { try { await sock.groupUpdateDescription(gid, desc); } catch {} }
            if (photoBuffer) { try { await sock.updateProfilePicture(gid, photoBuffer); } catch {} }

            // Group Permissions
            try { await sock.groupSettingUpdate(gid, perms.editSettings ? 'unlocked' : 'locked'); } catch {}
            try { await sock.groupSettingUpdate(gid, perms.sendMessages ? 'not_announcement' : 'announcement'); } catch {}
            try { await sock.groupMemberAddMode(gid, perms.addMembers ? 'all_member_add' : 'admin_add'); } catch {}
            try { await sock.groupJoinApprovalMode(gid, perms.approveMembers ? 'on' : 'off'); } catch {}

            let inviteLink = 'Could not fetch link';
            try {
                const inviteCode = await sock.groupInviteCode(gid);
                if (inviteCode) inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
            } catch {}

            groupResults.push(`📁 <b>${groupTitle}</b>\n🔗 ${inviteLink}`);
            successCount++;
        } catch (err) { failCount++; }

        if (progressMsg) {
            try { await bot.telegram.editMessageText(ctx.chat.id, progressMsg.message_id, undefined, `⏳ ${i + 1}/${count} groups created...`); } catch {}
        }
        await sleep(1500);
    }

    userState[id] = null; delete groupWizard[id];
    let report = `✅ ${successCount} done | ❌ ${failCount} failed.\n\n🔗 <b>Group Links:</b>\n\n`;
    if (groupResults.length > 0) report += groupResults.join('\n\n');
    report += BOT_FOOTER;

    await ctx.reply(report, { parse_mode: 'HTML', disable_web_page_preview: true });
    showHome(ctx);
}

bot.on('photo', async (ctx) => {
    const id = ctx.from.id;
    if (userState[id] === 'WIZARD_PHOTO') {
        try {
            const photos = ctx.message.photo;
            const fileLink = await ctx.telegram.getFileLink(photos[photos.length - 1].file_id);
            groupWizard[id].photoBuffer = await downloadFileBuffer(fileLink.href);
            await ctx.reply("Profile photo uploaded!");
            promptParticipantsStep(ctx, id);
        } catch (e) {
            ctx.reply(`❌ Failed to process photo. Tap Skip to continue:`, Markup.inlineKeyboard([[Markup.button.callback('⏭️ Skip', 'skip_photo')]]));
        }
    }
});

// 8. COPY GC LINKS (EXTRACT INLINE OPTIONS)
async function initiateCopyGCLinks(ctx) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    const sock = await getActiveWASocket(ctx.from.id);
    if (!sock) return ctx.reply("⚠️ Link WhatsApp first via <b>Login Account</b>." + BOT_FOOTER, { parse_mode: 'HTML' });

    await ctx.reply("🔍 Fetching your WhatsApp groups for links extraction... Please wait.");
    try {
        const groupsObj = await sock.groupFetchAllParticipating();
        const groupsList = Object.values(groupsObj);
        if (groupsList.length === 0) return ctx.reply("❌ No groups found on this WhatsApp account." + BOT_FOOTER, { parse_mode: 'HTML' });

        copyLinkSelection[ctx.from.id] = { allGroups: groupsList, selectedJids: new Set() };
        renderCopyLinksKeyboard(ctx, ctx.from.id, false);
    } catch (e) { ctx.reply(`❌ Failed to fetch groups: ${e.message}`); }
}
bot.action('menu_copy_links', initiateCopyGCLinks);
bot.hears('📋 Copy GC Links', initiateCopyGCLinks);

function renderCopyLinksKeyboard(ctx, userId, isEdit = true) {
    const session = copyLinkSelection[userId];
    const buttons = [];
    session.allGroups.forEach((grp, idx) => {
        const isChecked = session.selectedJids.has(grp.id);
        const title = (grp.subject || 'Unnamed Group').substring(0, 24);
        buttons.push([Markup.button.callback(`${isChecked ? '☑️' : '⬜'} ${title}`, `cplink_grp_${idx}`)]);
    });
    buttons.push([
        Markup.button.callback(`🔗 Get Links (${session.selectedJids.size})`, 'cplink_submit'),
        Markup.button.callback('🛑 Cancel', 'stop_process')
    ]);
    const msg = '📋 <b>Select Groups to Copy Links</b>\n\nTap on groups to select/deselect, then click <b>Get Links</b>:';
    if (isEdit) ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    else ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

bot.action(/cplink_grp_(.+)/, async (ctx) => {
    const id = ctx.from.id;
    if (!copyLinkSelection[id]) return ctx.answerCbQuery();
    const grp = copyLinkSelection[id].allGroups[parseInt(ctx.match[1])];
    if (!grp) return;
    if (copyLinkSelection[id].selectedJids.has(grp.id)) copyLinkSelection[id].selectedJids.delete(grp.id);
    else copyLinkSelection[id].selectedJids.add(grp.id);
    await ctx.answerCbQuery();
    renderCopyLinksKeyboard(ctx, id, true);
});

bot.action('cplink_submit', async (ctx) => {
    const id = ctx.from.id, session = copyLinkSelection[id];
    if (!session || session.selectedJids.size === 0) return ctx.answerCbQuery('⚠️ Select at least one group!', { show_alert: true });
    await ctx.answerCbQuery('Fetching Links...');
    try { await ctx.deleteMessage(); } catch {}

    const sock = await getActiveWASocket(id);
    if (!sock) { delete copyLinkSelection[id]; return ctx.reply("❌ WhatsApp disconnected." + BOT_FOOTER, { parse_mode: 'HTML' }); }

    const selectedJids = Array.from(session.selectedJids);
    const results = [];
    const waitMsg = await ctx.reply(`⏳ Generating invite links for ${selectedJids.length} groups...`);

    for (const gid of selectedJids) {
        const grp = session.allGroups.find(g => g.id === gid);
        const name = grp ? grp.subject : 'WhatsApp Group';
        try {
            const code = await sock.groupInviteCode(gid);
            results.push(`📁 <b>${name}</b>\n🔗 https://chat.whatsapp.com/${code}`);
        } catch (e) {
            results.push(`📁 <b>${name}</b>\n❌ <i>Could not fetch link (Admin rights required)</i>`);
        }
    }

    delete copyLinkSelection[id];
    try { await bot.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}

    let responseMsg = `📋 <b>Extracted Group Links (${results.length}):</b>\n\n` + results.join('\n\n') + BOT_FOOTER;
    await ctx.reply(responseMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
    showHome(ctx);
});

// 9. REMOVE MEMBERS (MULTI-SELECT & KICK NON-ADMINS)
async function initiateRemoveMembers(ctx) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    const sock = await getActiveWASocket(ctx.from.id);
    if (!sock) return ctx.reply("⚠️ Link WhatsApp first via <b>Login Account</b>." + BOT_FOOTER, { parse_mode: 'HTML' });

    await ctx.reply("🔍 Fetching your WhatsApp groups... Please wait.");
    try {
        const groupsObj = await sock.groupFetchAllParticipating();
        const groupsList = Object.values(groupsObj);
        if (groupsList.length === 0) return ctx.reply("❌ No groups found on this account." + BOT_FOOTER, { parse_mode: 'HTML' });

        removeSelection[ctx.from.id] = { allGroups: groupsList, selectedJids: new Set() };
        renderRemoveGroupsKeyboard(ctx, ctx.from.id, false);
    } catch (e) { ctx.reply(`❌ Failed to fetch groups: ${e.message}`); }
}
bot.action('menu_remove', initiateRemoveMembers);
bot.hears('🗑️ Remove Members', initiateRemoveMembers);

function renderRemoveGroupsKeyboard(ctx, userId, isEdit = true) {
    const session = removeSelection[userId];
    const buttons = [];
    session.allGroups.forEach((grp, idx) => {
        const isChecked = session.selectedJids.has(grp.id);
        const title = (grp.subject || 'Unnamed Group').substring(0, 24);
        buttons.push([Markup.button.callback(`${isChecked ? '☑️' : '⬜'} ${title}`, `rem_grp_${idx}`)]);
    });
    buttons.push([
        Markup.button.callback(`🚀 Submit Removal (${session.selectedJids.size})`, 'rem_submit'),
        Markup.button.callback('🛑 Cancel', 'stop_process')
    ]);
    const msg = '🗑️ <b>Select Groups to Remove Members</b>\n\nTap on groups to select/deselect, then click <b>Submit Removal</b>.\n<i>(Only non-admin members will be removed, admins will stay safe)</i>:';
    if (isEdit) ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    else ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

bot.action(/rem_grp_(.+)/, async (ctx) => {
    const id = ctx.from.id;
    if (!removeSelection[id]) return ctx.answerCbQuery();
    const grp = removeSelection[id].allGroups[parseInt(ctx.match[1])];
    if (!grp) return;
    if (removeSelection[id].selectedJids.has(grp.id)) removeSelection[id].selectedJids.delete(grp.id);
    else removeSelection[id].selectedJids.add(grp.id);
    await ctx.answerCbQuery();
    renderRemoveGroupsKeyboard(ctx, id, true);
});

bot.action('rem_submit', async (ctx) => {
    const id = ctx.from.id, session = removeSelection[id];
    if (!session || session.selectedJids.size === 0) return ctx.answerCbQuery('⚠️ Select at least one group!', { show_alert: true });
    await ctx.answerCbQuery('Processing Removal...');
    try { await ctx.deleteMessage(); } catch {}

    userState[id] = 'PROCESSING';
    const sock = await getActiveWASocket(id);
    if (!sock) { userState[id] = null; delete removeSelection[id]; return ctx.reply("❌ WhatsApp session disconnected." + BOT_FOOTER, { parse_mode: 'HTML' }); }

    const selectedJids = Array.from(session.selectedJids);
    let totalRemoved = 0, groupsProcessed = 0;
    const progressMsg = await ctx.reply(`⏳ Removing non-admin members from ${selectedJids.length} groups...`);

    for (const gid of selectedJids) {
        try {
            const metadata = await sock.groupMetadata(gid);
            const nonAdmins = metadata.participants.filter(p => !p.admin).map(p => p.id);
            if (nonAdmins.length > 0) {
                for (let i = 0; i < nonAdmins.length; i += 15) {
                    const batch = nonAdmins.slice(i, i + 15);
                    await sock.groupParticipantsUpdate(gid, batch, 'remove');
                    totalRemoved += batch.length;
                    await sleep(1000);
                }
            }
            groupsProcessed++;
        } catch (e) {}
    }

    userState[id] = null; delete removeSelection[id];
    try { await bot.telegram.deleteMessage(ctx.chat.id, progressMsg.message_id); } catch {}
    await ctx.reply(`✅ <b>Removal Completed!</b>\n\n👥 <b>Total Members Removed:</b> ${totalRemoved}\n🏷 <b>Groups Cleaned:</b> ${groupsProcessed}/${selectedJids.length}\n🛡️ <i>All Group Admins were preserved safely.</i>` + BOT_FOOTER, { parse_mode: 'HTML' });
    showHome(ctx);
});

// 10. EDIT GROUP PERMISSIONS
async function initiateEditGroup(ctx) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    const sock = await getActiveWASocket(ctx.from.id);
    if (!sock) return ctx.reply("⚠️ Link WhatsApp first via <b>Login Account</b>." + BOT_FOOTER, { parse_mode: 'HTML' });
    await ctx.reply("🔍 Loading your groups to configure permissions...");
    try {
        const groupsObj = await sock.groupFetchAllParticipating();
        const groupsList = Object.values(groupsObj);
        if (groupsList.length === 0) return ctx.reply("❌ No groups found." + BOT_FOOTER, { parse_mode: 'HTML' });
        editGroupSelection[ctx.from.id] = { allGroups: groupsList, selectedGid: groupsList[0].id, perms: { editSettings: false, sendMessages: true, addMembers: false, approveMembers: false } };
        const buttons = groupsList.slice(0, 10).map(g => [Markup.button.callback(`📁 ${(g.subject || 'Group').substring(0, 25)}`, `sel_edit_grp_${g.id}`)]);
        buttons.push([Markup.button.callback('🛑 Cancel', 'stop_process')]);
        ctx.reply("✏️ <b>Select a group to edit permissions:</b>", { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    } catch (e) { ctx.reply(`❌ Error: ${e.message}`); }
}
bot.action('menu_edit', initiateEditGroup);
bot.hears('✏️ Edit Group', initiateEditGroup);

bot.action(/sel_edit_grp_(.+)/, async (ctx) => {
    const id = ctx.from.id;
    if (!editGroupSelection[id]) return ctx.answerCbQuery();
    editGroupSelection[id].selectedGid = ctx.match[1];
    await ctx.answerCbQuery('Selected');
    ctx.editMessageText("⚙️ <b>Edit Group Permissions</b>\nToggle permissions and click Confirm:", {
        parse_mode: 'HTML', ...getPermissionsKeyboard(editGroupSelection[id].perms, 'edperm')
    });
});
bot.action(/edperm_toggle_(.+)/, async (ctx) => {
    const id = ctx.from.id;
    if (!editGroupSelection[id]) return ctx.answerCbQuery();
    editGroupSelection[id].perms[ctx.match[1]] = !editGroupSelection[id].perms[ctx.match[1]];
    await ctx.answerCbQuery('Toggled');
    ctx.editMessageText("⚙️ <b>Edit Group Permissions</b>\nToggle permissions and click Confirm:", {
        parse_mode: 'HTML', ...getPermissionsKeyboard(editGroupSelection[id].perms, 'edperm')
    });
});
bot.action('edperm_confirm', async (ctx) => {
    const id = ctx.from.id, session = editGroupSelection[id];
    if (!session) return ctx.answerCbQuery();
    await ctx.answerCbQuery('Applying...');
    const sock = await getActiveWASocket(id);
    if (!sock) return ctx.reply("❌ WhatsApp disconnected." + BOT_FOOTER, { parse_mode: 'HTML' });
    const { selectedGid: gid, perms } = session;
    try { await sock.groupSettingUpdate(gid, perms.editSettings ? 'unlocked' : 'locked'); } catch {}
    try { await sock.groupSettingUpdate(gid, perms.sendMessages ? 'not_announcement' : 'announcement'); } catch {}
    try { await sock.groupMemberAddMode(gid, perms.addMembers ? 'all_member_add' : 'admin_add'); } catch {}
    try { await sock.groupJoinApprovalMode(gid, perms.approveMembers ? 'on' : 'off'); } catch {}
    delete editGroupSelection[id];
    await ctx.reply("✅ <b>Group Permissions Updated Successfully!</b>" + BOT_FOOTER, { parse_mode: 'HTML' });
    showHome(ctx);
});

// 11. TEXT INPUT HANDLER
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim(), id = ctx.from.id;
    if (text.startsWith('/')) return;
    if (['📊 Status', '➕ Create Group', '📋 Copy GC Links', '🗑️ Remove Members', '✏️ Edit Group', '⚙️ Settings', '📱 Login Account', '💎 Buy VIP', '❓ Help'].includes(text)) return;

    if (userState[id] === 'WAITING_NUMBER') {
        const phone = text.replace(/[^0-9]/g, '');
        if (phone.length < 8 || phone.length > 16) {
            return ctx.reply('❌ Invalid format! Please enter phone number with country code.\nExample: 919876543210');
        }
        startWhatsAppPairing(id, phone, ctx);
        return;
    }
    if (userState[id] === 'WIZARD_COUNT') {
        const count = parseInt(text);
        if (isNaN(count) || count < 1 || count > 50) return ctx.reply("❌ Please enter a valid number between 1 and 50:");
        groupWizard[id].count = count; userState[id] = 'WIZARD_BASE_NAME';
        return ctx.reply("Enter base group name:", Markup.inlineKeyboard([[Markup.button.callback('🛑 Cancel', 'stop_process')]]));
    }
    if (userState[id] === 'WIZARD_BASE_NAME') {
        groupWizard[id].baseName = text; userState[id] = 'WIZARD_START_NUM';
        return ctx.reply("Enter starting number (e.g., 31):", Markup.inlineKeyboard([[Markup.button.callback('🛑 Cancel', 'stop_process')]]));
    }
    if (userState[id] === 'WIZARD_START_NUM') {
        const startNum = parseInt(text);
        if (isNaN(startNum) || startNum < 0) return ctx.reply("❌ Please enter a valid starting number (e.g., 1 or 31):");
        groupWizard[id].startNum = startNum; userState[id] = 'WIZARD_DESC';
        return ctx.reply("Send group description or tap Skip.", Markup.inlineKeyboard([[Markup.button.callback('⏭️ Skip', 'skip_desc')], [Markup.button.callback('🛑 Cancel', 'stop_process')]]));
    }
    if (userState[id] === 'WIZARD_DESC') {
        groupWizard[id].desc = text; userState[id] = 'WIZARD_PHOTO';
        return ctx.reply("Send profile photo or tap Skip.", Markup.inlineKeyboard([[Markup.button.callback('⏭️ Skip', 'skip_photo')], [Markup.button.callback('🛑 Cancel', 'stop_process')]]));
    }
    if (userState[id] === 'WIZARD_MEMBERS') {
        const rawNumbers = text.split(/[\s,]+/);
        const participants = rawNumbers
            .map(num => num.replace(/[^0-9]/g, ''))
            .filter(num => num.length >= 8 && num.length <= 16)
            .map(num => `${num}@s.whatsapp.net`);

        groupWizard[id].participants = participants;
        await ctx.reply(`✅ Added ${participants.length} member(s) to group setup.`);
        showPermissionsWizard(ctx, id);
        return;
    }
});

// 12. ADMIN COMMANDS
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

bot.command(['broadcast', 'bc'], async (ctx) => {
    if (ctx.from.username !== ADMIN_USERNAME && ctx.from.id !== ADMIN_ID) return;
    const msg = ctx.message.text.split(' ').slice(1).join(' ');
    if (!msg) return ctx.reply('⚠️ Usage: `/broadcast Your message here`', { parse_mode: 'Markdown' });
    const allUsers = await User.find({});
    let sent = 0, fail = 0;
    const progress = await ctx.reply(`📢 Sending broadcast to ${allUsers.length} users...`);
    for (const u of allUsers) {
        try { await bot.telegram.sendMessage(u.user_id, `📢 <b>OFFICIAL ANNOUNCEMENT</b>\n\n${msg}`, { parse_mode: 'HTML' }); sent++; } catch { fail++; }
    }
    await bot.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, 
        `✅ <b>Broadcast Completed!</b>\n\n👥 Total: ${allUsers.length}\n📨 Sent: ${sent}\n❌ Failed: ${fail}` + BOT_FOOTER, { parse_mode: 'HTML' }
    );
});

bot.launch().then(() => console.log('Bot Launched Successfully'));
