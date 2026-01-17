#!/usr/bin/env node

/**
 * Simple build script for Leekha Card Game
 * Copies production files to dist/ folder
 */

const fs = require('fs');
const path = require('path');

const DIST_DIR = 'dist';

// Files and folders to include in production build
const PRODUCTION_FILES = [
    'index.html',
    'style.css',
    'main.js',
    'js',
    'assets'
];

// Clean and create dist directory
function cleanDist() {
    if (fs.existsSync(DIST_DIR)) {
        fs.rmSync(DIST_DIR, { recursive: true });
    }
    fs.mkdirSync(DIST_DIR);
    console.log('✓ Cleaned dist/');
}

// Copy a file or directory recursively
function copyRecursive(src, dest) {
    const stat = fs.statSync(src);

    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src);
        for (const entry of entries) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

// Build production files
function build() {
    console.log('\nBuilding Leekha Card Game...\n');

    cleanDist();

    for (const file of PRODUCTION_FILES) {
        const src = path.join(__dirname, file);
        const dest = path.join(__dirname, DIST_DIR, file);

        if (!fs.existsSync(src)) {
            console.log(`⚠ Skipping ${file} (not found)`);
            continue;
        }

        copyRecursive(src, dest);
        console.log(`✓ Copied ${file}`);
    }

    console.log('\n✅ Build complete! Production files are in dist/\n');
}

build();
