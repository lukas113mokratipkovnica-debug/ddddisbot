// Catalog of modules and ready-made bots (templates). Each bot on the platform = a set of enabled modules.
const MODULES = {
  moderation: { name: 'Moderation', icon: 'shield', group: 'Moderation', desc: 'Ban, kick, timeout, warnings, purge, lock, cases.' },
  automod: { name: 'AutoMod', icon: 'bot', group: 'Moderation', desc: 'Filters swearing, links, invites, spam, CAPS and mass mentions.' },
  logging: { name: 'Logs', icon: 'scroll', group: 'Moderation', desc: 'Every change on the server in a log channel.' },
  verification: { name: 'Verification', icon: 'badge', group: 'Moderation', desc: 'Button + captcha code before accessing the server.' },
  welcome: { name: 'Welcome', icon: 'hand', group: 'Members', desc: 'Join/leave messages, DMs and autoroles.' },
  invites: { name: 'Invite tracking', icon: 'link', group: 'Members', desc: 'Who invited whom, an invite leaderboard.' },
  roles: { name: 'Button roles', icon: 'layers', group: 'Members', desc: 'Button panels for self-assignable roles.' },
  leveling: { name: 'Leveling', icon: 'trending', group: 'Engagement', desc: 'XP, ranks, leaderboard and reward roles.' },
  economy: { name: 'Economy', icon: 'coins', group: 'Engagement', desc: 'Money, daily, work, bank, shop, gambling, robbery.' },
  giveaways: { name: 'Giveaway', icon: 'gift', group: 'Engagement', desc: 'Button giveaways with automatic draws.' },
  counting: { name: 'Counting', icon: 'hash', group: 'Engagement', desc: 'A counting game with a high score and rules.' },
  fun: { name: 'Fun', icon: 'smile', group: 'Engagement', desc: '8ball, rock-paper-scissors, ship, ratings, dice…' },
  tickets: { name: 'Tickets', icon: 'ticket', group: 'Support', desc: 'Private support channels with a transcript.' },
  customcommands: { name: 'Custom commands', icon: 'terminal', group: 'Support', desc: 'Your own commands and keyword autoresponders.' },
  sticky: { name: 'Sticky messages', icon: 'pin', group: 'Support', desc: 'A message that always stays at the bottom of the channel.' },
  starboard: { name: 'Starboard', icon: 'star', group: 'Community', desc: 'The best messages by reactions.' },
  suggestions: { name: 'Suggestions', icon: 'bulb', group: 'Community', desc: '/suggest with voting and a thread.' },
  confessions: { name: 'Anonymous confessions', icon: 'mask', group: 'Community', desc: 'Anonymous messages with a log for moderators.' },
  birthdays: { name: 'Birthdays', icon: 'cake', group: 'Community', desc: 'Birthday wishes and a birthday role for the day.' },
  tempvoice: { name: 'Temp voice', icon: 'mic', group: 'Voice', desc: 'Join a channel → get your own voice channel.' },
  serverstats: { name: 'Stats channels', icon: 'chart', group: 'Voice', desc: 'Voice channels that show the number of members, bots and boosts.' },
  reminders: { name: 'Reminders', icon: 'clock', group: 'Tools', desc: '/remind for personal reminders.' },
  afk: { name: 'AFK', icon: 'moon', group: 'Tools', desc: 'AFK status with automatic replies to mentions.' },
  notifications: { name: 'Notifications (YouTube/RSS)', icon: 'bell', group: 'Tools', desc: 'New YouTube videos and RSS posts in a channel.' },
  utility: { name: 'Utility', icon: 'wrench', group: 'Tools', desc: 'Serverinfo, userinfo, avatar, polls, say, embed.' },
};

const ALL = Object.keys(MODULES);

const TEMPLATES = {
  allinone: { name: 'All-in-One', icon: 'sparkles', tagline: 'Everything in one bot', desc: 'All modules enabled. One bot for the whole server.', modules: ALL, color: '#7c5cff' },
  moderation: { name: 'Moderator', icon: 'shield', tagline: 'Server security', desc: 'Moderation, AutoMod, logs and verification.', modules: ['moderation', 'automod', 'logging', 'verification', 'utility'], color: '#ef4444' },
  leveling: { name: 'Leveling', icon: 'trending', tagline: 'Ranks and XP', desc: 'XP for activity, leaderboard, reward roles.', modules: ['leveling', 'utility'], color: '#22c55e' },
  economy: { name: 'Economy', icon: 'coins', tagline: 'Virtual currency', desc: 'Money, work, bank, a role shop, gambling.', modules: ['economy', 'fun'], color: '#eab308' },
  tickets: { name: 'Support', icon: 'ticket', tagline: 'Tickets and support', desc: 'Ticket system with transcripts, custom commands, sticky messages.', modules: ['tickets', 'customcommands', 'sticky', 'utility'], color: '#3b82f6' },
  welcome: { name: 'Welcome', icon: 'hand', tagline: 'Member onboarding', desc: 'Welcome messages, autoroles, verification and invite tracking.', modules: ['welcome', 'verification', 'invites', 'roles'], color: '#06b6d4' },
  giveaway: { name: 'Giveaway', icon: 'gift', tagline: 'Giveaways', desc: 'Button giveaways, rerolls, multiple winners.', modules: ['giveaways'], color: '#ec4899' },
  community: { name: 'Community', icon: 'users', tagline: 'Active community', desc: 'Starboard, suggestions, confessions, counting, birthdays.', modules: ['starboard', 'suggestions', 'confessions', 'counting', 'birthdays', 'fun'], color: '#f97316' },
  voice: { name: 'Voice Master', icon: 'mic', tagline: 'Voice channels', desc: 'Temporary voice channels and stats channels.', modules: ['tempvoice', 'serverstats'], color: '#8b5cf6' },
  notifier: { name: 'Notifier', icon: 'bell', tagline: 'YouTube & RSS', desc: 'Automatic alerts for new videos and posts.', modules: ['notifications'], color: '#f43f5e' },
  utility: { name: 'Utility', icon: 'wrench', tagline: 'Everyday tools', desc: 'Reminders, AFK, polls, info commands, sticky messages.', modules: ['utility', 'reminders', 'afk', 'sticky'], color: '#14b8a6' },
  roles: { name: 'Role Manager', icon: 'layers', tagline: 'Self-assignable roles', desc: 'Button role panels and autoroles.', modules: ['roles', 'welcome'], color: '#a855f7' },
  fun: { name: 'Fun', icon: 'smile', tagline: 'Fun and games', desc: 'Games, counting, economy and fun commands.', modules: ['fun', 'counting', 'economy'], color: '#84cc16' },
};

module.exports = { MODULES, TEMPLATES, ALL };
