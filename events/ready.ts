import { Events } from 'discord.js';
import type { Client } from 'discord.js';

export default {
    name: Events.ClientReady,
    once: true,
    execute: (c: Client) => {
        if (!c.user) {
            console.log('✅ Ready, but client user is null');
            return;
        }
        
        console.log(`✅ Ready! Logged in as ${c.user.tag}`);
        console.log(`Bot is in ${c.guilds.cache.size} servers`);
        console.log(`Loaded ${c.commands.size} commands`);
    }
};