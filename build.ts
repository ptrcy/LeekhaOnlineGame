#!/usr/bin/env bun

/**
 * Build script for Leekha Card Game using Bun
 * Bundles JS and copies static assets to dist/
 */

import { rmSync, mkdirSync, cpSync, existsSync } from 'fs';
import { join } from 'path';

const DIST_DIR = 'dist';
const ROOT = import.meta.dir;

// Clean and create dist directory
function cleanDist() {
    if (existsSync(DIST_DIR)) {
        rmSync(DIST_DIR, { recursive: true });
    }
    mkdirSync(DIST_DIR);
    console.log('✓ Cleaned dist/');
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
