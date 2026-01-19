"use strict";

const SOUND_DEFS = {
    playCard: new Params().blipSelect(),
    winTrick: new Params().pickupCoin(),
    deal: new Params().blipSelect()
};

// Customize the deal sound to be a bit different
SOUND_DEFS.deal.p_base_freq = 0.6 + Math.random() * 0.2;
SOUND_DEFS.deal.p_env_sustain = 0.1;


class AudioManager {
    constructor(eventEmitter) {
        this.events = eventEmitter;
        this.sounds = {};
        this.masterVolume = 0.2;
        this.isEnabled = true;

        this.preload();
        this.subscribeToEvents();
    }

    preload() {
        for (const key in SOUND_DEFS) {
            this.sounds[key] = sfxr.toAudio(SOUND_DEFS[key]);
        }
    }

    subscribeToEvents() {
        this.events.on("CARD_PLAYED", () => this.playSound("playCard"));
        this.events.on("TRICK_COMPLETE", (data) => {
            if (data.winnerIndex === 0) {
                this.playSound("winTrick");
            }
        });
        this.events.on("HANDS_DEALT", () => this.playSound("deal"));
    }

    playSound(soundName) {
        if (!this.isEnabled || !this.sounds[soundName]) return;
        this.sounds[soundName].volume = this.masterVolume;
        this.sounds[soundName].currentTime = 0;
        this.sounds[soundName].play();
    }

    setVolume(volume) {
        this.masterVolume = volume;
    }

    toggleSound(isEnabled) {
        this.isEnabled = isEnabled;
    }
}

export { AudioManager };
