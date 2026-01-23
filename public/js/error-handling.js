"use strict";

window.onerror = function (msg, url, line, col, error) {
    const status = document.getElementById('status-text');
    if (status) {
        status.textContent = "Error: " + msg;
        status.style.color = 'red';
    }
    // Also create a visual overlay for detailed error if possible
    const errDiv = document.createElement('div');
    errDiv.style.position = 'fixed';
    errDiv.style.top = '0';
    errDiv.style.left = '0';
    errDiv.style.width = '100%';
    errDiv.style.background = 'rgba(100,0,0,0.9)';
    errDiv.style.color = 'white';
    errDiv.style.padding = '20px';
    errDiv.style.zIndex = '99999';
    errDiv.textContent = `Error: ${msg}\nIn ${url}:${line}:${col}`;
    document.body.appendChild(errDiv);
    return false;
};
// Catch promise rejections too
window.onunhandledrejection = function (event) {
    const status = document.getElementById('status-text');
    if (status) {
        status.textContent = "Error: " + event.reason;
        status.style.color = 'red';
    }
};
