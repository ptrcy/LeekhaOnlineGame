"use strict";

const SOUND_DEFS = {
    playCard: ["0",",",",0.0113,,0.207,0.4859,,,-0.6979,0.5969,,,,,,,1,,,,,0.5"],
    winTrick: ["0",",",",0.3926,,0.4962,0.2222,,0.2336,,,,,0.4356,0.1197,,,,1,,,,,0.5"],
    deal: ["0",",",",0.0199,,0.2587,0.0637,,-0.7107,,,,,,,,,,,1,,,,,0.5"]
};

class AudioManager {
    constructor(eventEmitter) {
        this.events = eventEmitter;
        this.sounds = {};
        this.masterVolume = 0.5;
        this.isEnabled = true;

        this.preload();
        this.subscribeToEvents();
    }

    preload() {
        for (const key in SOUND_DEFS) {
            const audio = new Audio();
            audio.src = sfxr.toWave(SOUND_DEFS[key]).dataURI;
            this.sounds[key] = audio;
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
