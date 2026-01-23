#!/usr/bin/env bun

/**
 * Build script for Leekha Card Game using Bun
 * Bundles JS and copies static assets to dist/
 */

import { rmSync, mkdirSync, cpSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const DIST_DIR = 'dist';
const ROOT = import.meta.dir;

// Clean dist directory by deleting its contents (not the folder itself)
function cleanDist() {
    if (existsSync(DIST_DIR)) {
        // Delete all contents of dist/ folder
        const files = readdirSync(DIST_DIR);
        for (const file of files) {
            const filePath = join(DIST_DIR, file);
            const stat = statSync(filePath);
            if (stat.isDirectory()) {
                rmSync(filePath, { recursive: true });
            } else {
                rmSync(filePath);
            }
        }
        console.log('✓ Cleaned dist/');
    } else {
        mkdirSync(DIST_DIR);
    }
}

// Bundle JavaScript with Bun
async function bundleJS() {
    const result = await Bun.build({
        entrypoints: [join(ROOT, 'main.js')],
        outdir: join(ROOT, DIST_DIR),
        minify: true,
        sourcemap: 'none',
    });

    if (!result.success) {
        console.error('Bundle failed:');
        for (const log of result.logs) {
            console.error(log);
        }
        process.exit(1);
    }

    console.log('✓ Bundled main.js');
}

// Copy static assets
function copyStatic() {
    const staticFiles = ['index.html', 'style.css'];
    const staticDirs = ['assets'];
    // Copy library files that are not bundled but referenced
    const libFiles = ['js/sfxr.js', 'js/riffwave.js', 'js/error-handling.js'];

    for (const file of staticFiles) {
        const src = join(ROOT, file);
        const dest = join(ROOT, DIST_DIR, file);
        if (existsSync(src)) {
            cpSync(src, dest);
            console.log(`✓ Copied ${file}`);
        }
    }

    for (const dir of staticDirs) {
        const src = join(ROOT, dir);
        const dest = join(ROOT, DIST_DIR, dir);
        if (existsSync(src)) {
            cpSync(src, dest, { recursive: true });
            console.log(`✓ Copied ${dir}/`);
        }
    }

    // Copy library files to dist/js/
    const distJsDir = join(ROOT, DIST_DIR, 'js');
    if (!existsSync(distJsDir)) {
        mkdirSync(distJsDir);
    }

    for (const file of libFiles) {
        const src = join(ROOT, file);
        const dest = join(ROOT, DIST_DIR, file);
        // Ensure directory exists for file
        if (existsSync(src)) {
            cpSync(src, dest);
            console.log(`✓ Copied ${file}`);
        } else {
            console.warn(`! Warning: ${file} not found`);
        }
    }
}

// Main build
async function build() {
    console.log('\nBuilding Leekha Card Game with Bun...\n');

    cleanDist();
    await bundleJS();
    copyStatic();

    console.log('\n✅ Build complete! Production files are in dist/\n');
}

build();
