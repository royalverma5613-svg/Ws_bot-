const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const translate = require('translate-google');
const express = require('express');

// 24/7 Web Server (Render ke liye)
const app = express();
app.get('/', (req, res) => res.send('Ws_gc_2xbot is Running!'));
app.listen(process.env.PORT || 3000);

// Aapki khaas details
const TG_BOT_TOKEN = '8992778279:AAHH7zvVcF3Oh1_KA3QR5Q_qRG7eEA6t02c';
const ADMIN_ID = 7959829014;
const UPI_ID = 'kumar.14534@superyes';
const FORCE_SUB_CHAT_ID = '@ai2kmm';
const FORCE_SUB_LINK = 'https://t.me/ai2kmm';

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI; 
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
      .then(() => console.log('MongoDB Connected!'))
      .catch(err => console.log(err));
}

// User Database Structure
const UserSchema = new mongoose.Schema({
    user_id: Number,
    language: { type: String, default: 'en' },
    is_vip: { type: Number, default: 0 },
    vip_expiry: Number
});
const User = mongoose.model('User', UserSchema);

const bot = new Telegraf(TG_BOT_TOKEN);

// Teeno Languages ka Text Data
const langData = {
    en: { welcome: "🎉 Welcome! Select language:", menu: "🏠 **Main Menu**\nSelect an option:", btn_login: "📱 Login Account", btn_status: "📊 Status", btn_create: "➕ Create Group", btn_remove: "🗑️ Remove Members", btn_edit: "✏️ Edit Group", btn_settings: "⚙️ Settings", btn_lang: "🌐 Change Lang", btn_vip: "💎 Buy VIP", vip_text: `💎 **VIP PLANS:**\n• 1 Day = ₹30\n• 7 Days = ₹120\n• 14 Days = ₹220\n• 1 Month = ₹350\n💳 **UPI:** \`${UPI_ID}\`\nSend screenshot to admin.`, lang_changed: "✅ Language changed to English." },
    id: { welcome: "🎉 Selamat datang! Pilih bahasa:", menu: "🏠 **Menu Utama**\nPilih opsi:", btn_login: "📱 Masuk Akun", btn_status: "📊 Status", btn_create: "➕ Buat Grup", btn_remove: "🗑️ Hapus Anggota", btn_edit: "✏️ Edit Grup", btn_settings: "⚙️ Pengaturan", btn_lang: "🌐 Ganti Bahasa", btn_vip: "💎 Beli VIP", vip_text: `💎 **PAKET VIP:**\n• 1 Hari = ₹30\n• 7 Hari = ₹120\n• 14 Hari = ₹220\n• 1 Bulan = ₹350\n💳 **UPI:** \`${UPI_ID}\`\nKirim ke admin.`, lang_changed: "✅ Bahasa diubah." },
    zh: { welcome: "🎉 欢迎！请选择您的语言：", menu: "🏠 **主菜单**\n选择一个选项：", btn_login: "📱 登录", btn_status: "📊 状态", btn_create: "➕ 创建群组", btn_remove: "🗑️ 删除成员", btn_edit: "✏️ 编辑群组", btn_settings: "⚙️ 设置", btn_lang: "🌐 更改语言", btn_vip: "💎 购买 VIP", vip_text: `💎 **VIP 套餐:**\n• 1 天 = ₹30\n• 7 天 = ₹120\n• 14 天 = ₹220\n• 1 个月 = ₹350\n💳 **UPI:** \`${UPI_ID}\`\n发送给管理员。`, lang_changed: "✅ 语言已更改。" }
};

function getMainMenu(userLang) {
    const t = langData[userLang] || langData['en'];
    return Markup.inlineKeyboard([
        [Markup.button.callback(t.btn_login, 'menu_login'), Markup.button.callback(t.btn_status, 'menu_status')],
        [Markup.button.callback(t.btn_create, 'menu_create'), Markup.button.callback(t.btn_remove, 'menu_remove')],
        [Markup.button.callback(t.btn_edit, 'menu_edit'), Markup.button.callback(t.btn_settings, 'menu_settings')],
        [Markup.button.callback(t.btn_lang, 'change_lang'), Markup.button.callback(t.btn_vip, 'buy_vip')]
    ]);
}

// Force Sub Check
async function isSubscribed(ctx) {
    try {
        const chatMember = await ctx.telegram.getChatMember(FORCE_SUB_CHAT_ID, ctx.from.id);
        return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch (e) { return true; }
}

bot.command('start', async (ctx) => {
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
            user = new User({ user_id: ctx.from.id, is_vip: 1, vip_expiry: Math.floor(Date.now() / 1000) + (24 * 60 * 60) });
            await user.save();
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
    const t = langData[lang];
    ctx.editMessageText(t.lang_changed + "\n\n" + t.menu, getMainMenu(lang));
});

bot.action('change_lang', (ctx) => {
    ctx.editMessageText("Select new language:", Markup.inlineKeyboard([
        [Markup.button.callback('🇬🇧 English', 'lang_en'), Markup.button.callback('🇮🇩 Indo', 'lang_id'), Markup.button.callback('🇨🇳 中文', 'lang_zh')]
    ]));
});

bot.action('buy_vip', async (ctx) => {
    let user = await User.findOne({ user_id: ctx.from.id });
    const userLang = user ? user.language : 'en';
    ctx.reply(langData[userLang].vip_text, { parse_mode: 'Markdown' });
    ctx.answerCbQuery();
});

bot.action('menu_login', (ctx) => {
    ctx.reply("Send number with country code (e.g., 919876XXXXX):");
    ctx.answerCbQuery();
});

// Broadcast Command
bot.command('addbroadcast', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.reply('🚫 Owner only.');
    const messageText = ctx.message.text.replace('/addbroadcast', '').trim();
    if (!messageText) return ctx.reply('Usage: `/addbroadcast Your message here`', {parse_mode: 'Markdown'});
    
    ctx.reply('⏳ Broadcasting and translating... Please wait.');
    
    let users = await User.find({});
    let success = 0;
    for (let user of users) {
        try {
            let targetLang = user.language === 'zh' ? 'zh-cn' : user.language;
            let textToSend = messageText;
            if (targetLang !== 'en') {
                textToSend = await translate(messageText, {to: targetLang});
            }
            await bot.telegram.sendMessage(user.user_id, textToSend);
            success++;
        } catch (e) {}
    }
    ctx.reply(`✅ Broadcast finished. Sent to ${success} users.`);
});

bot.launch();
console.log('Bot Started...');
