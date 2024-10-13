let hasPopupTriggered = false;
let isMouseDown = false;
let lastKeyTime = 0;
let lastClickTime = 0;
let lastKey = '';
let isDoubleClick;
let previewMode;
let clickTimeout = null;
let focusAt;
let theme;
let blurOverlay;

let linkDisabledUrls,
    closeWhenFocusedInitialWindow,
    blurEnable,
    blurPx,
    blurTime,
    closeByEsc,
    doubleTapKeyToSendPageBack,
    previewModeWindowType,
    previewModeBlacklist;

const configs = {
    'closeWhenFocusedInitialWindow': true,
    'blurEnable': true,
    'blurPx': 3,
    'blurTime': 1,
    'popupWindowsInfo': {},
    'closeByEsc': true,
    'doubleTapKeyToSendPageBack': 'None',
    'previewModeDisabledUrls': [],
    'previewModeWindowType': 'popup',
    'previewModeEnable': true,
    'doubleClickAsClick': true,
    'rememberPopupSizeAndPosition': true,
    'rememberPopupSizeAndPositionForDomain': true,
    'isFirefox': false,
    'linkDisabledUrls': [],
    'enableContainerIdentify': true
};

async function loadUserConfigs(keys = Object.keys(configs)) {
    return new Promise(resolve => {
        chrome.storage.local.get(keys, storedConfigs => {
            const mergedConfigs = { ...configs, ...storedConfigs };
            Object.assign(configs, mergedConfigs);
            resolve(mergedConfigs);
        });
    });
}


async function handleKeyDown(e) {
    if (e.key === 'Escape') {
        try {
            if (closeByEsc) {
                chrome.runtime.sendMessage({ action: 'closeCurrentTab' });
            } else return;
        } catch (error) { }
    } else {
        try {
            if (doubleTapKeyToSendPageBack === 'None') return;

            const keyMap = { 'Ctrl': e.ctrlKey, 'Alt': e.altKey, 'Shift': e.shiftKey, 'Meta': e.metaKey };
            const key = e.key;
            const currentTime = new Date().getTime();
            const timeDifference = currentTime - lastKeyTime;
            if (keyMap[doubleTapKeyToSendPageBack] && key === lastKey && timeDifference < 300) {
                chrome.runtime.sendMessage({ action: 'sendPageBack' });
            } else {
                lastKeyTime = currentTime;
                lastKey = key;
            }
        } catch (error) { }

    }
}


function handleMouseDown(e) {
    if (focusAt && Date.now() - focusAt < 50) {
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    focusAt = null;
    removeBlurOverlay();

    const linkElement = e.target instanceof HTMLElement && (e.target.tagName === 'A' ? e.target : e.target.closest('a'));
    const linkUrl = linkElement ? linkElement.href : null;
    if (linkUrl && linkUrl.trim().startsWith('javascript:')) return;
    if (isUrlDisabled(linkUrl, linkDisabledUrls)) return;


    if (!(isUrlDisabled(window.location.href, previewModeDisabledUrls))) {
        previewMode = true;

        // Add the event listener
        const events = ["click", "mouseup"];
        events.forEach(event => document.addEventListener(event, handleEvent, true));

        // In popup.js or content.js
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            theme = 'dark';
        } else {
            theme = 'light';
        }

        chrome.runtime.sendMessage({ action: 'updateIcon', previewMode: previewMode, theme: theme });
    }

    try {
        if (closeWhenFocusedInitialWindow) {
            chrome.runtime.sendMessage({ action: 'windowRegainedFocus' });
        }
        savePositionSize();

    } catch (error) {
        console.error('Error loading user configs:', error);
    }

    isMouseDown = true;
    hasPopupTriggered = false;
}


function handleDoubleClick(e) {
    isDoubleClick = true;
    // Prevent the single-click action from triggering
    clearTimeout(clickTimeout);

    const linkElement = e.target instanceof HTMLElement && (e.target.tagName === 'A' ? e.target : e.target.closest('a'));
    const linkUrl = linkElement ? linkElement.href : null;
    if (linkUrl && linkUrl.trim().startsWith('javascript:')) return;
    if (isUrlDisabled(linkUrl, linkDisabledUrls)) return;

    e.preventDefault(); // Prevent the default double-click action
    e.stopPropagation(); // Stop the event from bubbling up

    // Check if the double-clicked element is a link
    if (linkUrl) {
        hasPopupTriggered = true;
        isDoubleClick = true;
        e.target.click();
    } else {
        resetClickState();
    }

    document.removeEventListener('dblclick', handleDoubleClick, true);


    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        theme = 'dark';
    } else {
        theme = 'light';
    }
    chrome.runtime.sendMessage({ action: 'updateIcon', previewMode: previewMode, theme: theme });

    isDoubleClick = false;
}

function resetClickState() {
    // Reset variables after click or double-click
    isDoubleClick = false;
    hasPopupTriggered = false;
    clearTimeout(clickTimeout);
}

function handleEvent(e) {

    if (e.type === 'click') {
        document.addEventListener('dblclick', handleDoubleClick, true);
        const linkElement = e.target instanceof HTMLElement && (e.target.tagName === 'A' ? e.target : e.target.closest('a'));
        const linkUrl = linkElement ? linkElement.href : null;
        if (linkUrl && linkUrl.trim().startsWith('javascript:')) return;
        if (isUrlDisabled(linkUrl, linkDisabledUrls)) return;

        if (previewMode && linkUrl && !isDoubleClick) {
            e.preventDefault();
            e.stopPropagation();

            clickTimeout = setTimeout(() => {
                handlePreviewMode(e);

            }, 250);
        }

        // In popup.js or content.js
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            theme = 'dark';
        } else {
            theme = 'light';
        }

        chrome.runtime.sendMessage({ action: 'updateIcon', previewMode: previewMode, theme: theme });

    }


    // In popup.js or content.js
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        theme = 'dark';
    } else {
        theme = 'light';
    }

    chrome.runtime.sendMessage({ action: 'updateIcon', previewMode: previewMode, theme: theme });
}

function handlePreviewMode(e) {

    if (!isMouseDown || hasPopupTriggered || isDoubleClick) return;

    const linkElement = e.target instanceof HTMLElement && (e.target.tagName === 'A' ? e.target : e.target.closest('a'));
    const linkUrl = linkElement ? linkElement.href : null;

    if (linkUrl && linkUrl.trim().startsWith('javascript:')) return;

    if (linkUrl) {
        e.preventDefault();
        e.stopPropagation();

        if (blurEnable) {
            addBlurOverlay(blurPx, blurTime);
        }
        addClickMask();

        chrome.runtime.sendMessage({
            linkUrl: linkUrl,
            lastClientX: e.screenX,
            lastClientY: e.screenY,
            width: window.screen.availWidth,
            height: window.screen.availHeight,
            top: window.screen.availTop,
            left: window.screen.availLeft,
            trigger: 'click'
        }, () => {
            hasPopupTriggered = true;
            isDoubleClick = false;
        });

    }


}


function isUrlDisabled(url, disabledUrls) {
    return disabledUrls.some(disabledUrl => {
        // Check if the pattern is a regex
        if (disabledUrl.startsWith('/') && disabledUrl.endsWith('/')) {
            const regexPattern = disabledUrl.slice(1, -1); // Remove leading and trailing slashes
            try {
                const regex = new RegExp(regexPattern);
                return regex.test(url);
            } catch (e) {
                console.error('Invalid regex pattern:', regexPattern);
                return false;
            }
        }
        // Check if the pattern is a wildcard pattern
        else if (disabledUrl.includes('*')) {
            const regexPattern = disabledUrl
                .replace(/\\./g, '\\\\.') // Escape dots
                .replace(/\*/g, '.*'); // Replace wildcards with regex equivalent
            try {
                const regex = new RegExp(`^${regexPattern}$`);
                return regex.test(url);
            } catch (e) {
                console.error('Invalid wildcard pattern:', regexPattern);
                return false;
            }
        }
        // Check if the pattern is plain text
        else {
            return url === disabledUrl;
        }
    });
}


async function checkUrlAndToggleListeners() {
    hasPopupTriggered = false;

    const data = await loadUserConfigs([
        'previewModeDisabledUrls',
        'linkDisabledUrls',
        'blurEnable',
        'blurPx',
        'blurTime',
        'closeByEsc',
        'closeWhenFocusedInitialWindow',
        'doubleTapKeyToSendPageBack',
        'previewModeWindowType',
        'enableContainerIdentify'
    ]);
    previewModeDisabledUrls = data.previewModeDisabledUrls || [];
    linkDisabledUrls = data.linkDisabledUrls || [];
    blurEnable = (data.blurEnable !== undefined) ? data.blurEnable : true;
    blurPx = data.blurPx || 3;
    blurTime = data.linkDisabledUrls || 1;
    closeByEsc = (data.closeByEsc !== undefined) ? data.closeByEsc : true;
    closeWhenFocusedInitialWindow = (data.closeWhenFocusedInitialWindow !== undefined) ? data.closeWhenFocusedInitialWindow : true;
    doubleTapKeyToSendPageBack = data.doubleTapKeyToSendPageBack || 'Ctrl';
    previewModeWindowType = data.previewModeWindowType || 'popup';
    enableContainerIdentify = (data.enableContainerIdentify !== undefined) ? data.enableContainerIdentify : true;

    if (!(isUrlDisabled(window.location.href, previewModeDisabledUrls)) && data.previewModeEnable) {
        previewMode = (previewMode !== undefined) ? previewMode : data.previewModeEnable;

        // Add the event listener
        const events = ["click", "mouseup"];
        events.forEach(event => document.addEventListener(event, handleEvent, true));
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('scrollend', savePositionSize);
    } else {
        previewMode = false;
        const events = ["click", "mouseup"];
        events.forEach(event => document.removeEventListener(event, handleEvent, true));
        document.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('scrollend', savePositionSize);
    }


    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        theme = 'dark';
    } else {
        theme = 'light';
    }
    chrome.runtime.sendMessage({ action: 'updateIcon', previewMode: previewMode, theme: theme });

}

function savePositionSize() {
    chrome.runtime.sendMessage({ action: 'savePositionSize' });
}

chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'local' && (
        changes.previewModeDisabledUrls ||
        changes.linkDisabledUrls ||
        changes.closeWhenFocusedInitialWindow ||
        changes.closeByEsc ||
        changes.doubleTapKeyToSendPageBack ||
        changes.previewModeWindowType ||
        changes.blurEnable ||
        changes.blurPx ||
        changes.blurTime ||
        changes.enableContainerIdentify
    )) {
        await checkUrlAndToggleListeners();
    }
});

checkUrlAndToggleListeners();

let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        chrome.storage.local.set({ lastUrl: url });
        checkUrlAndToggleListeners();
    }

}).observe(document, { subtree: true, childList: true });

chrome.storage.local.get('lastUrl', (data) => {
    if (data.lastUrl) {
        lastUrl = data.lastUrl;
    }
});

window.addEventListener('focus', async () => {
    focusAt = Date.now();
    isDoubleClick = false;
    removeBlurOverlay();
    document.addEventListener('keydown', handleKeyDown);

    try {
        // In popup.js or content.js
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            theme = 'dark';
        } else {
            theme = 'light';
        }

        chrome.runtime.sendMessage({ action: 'updateIcon', previewMode: previewMode, theme: theme });
        if (closeWhenFocusedInitialWindow) {
            chrome.runtime.sendMessage( { action: 'windowRegainedFocus' });
        }
    } catch (error) {
        // console.error('Error loading user configs:', error);
    }
    if (window.getSelection().toString()) {
        window.getSelection().removeAllRanges();
    }
    setTimeout(() => {
        removeClickMask();
    }, 50);
});

function addClickMask() {
    if (!document.head || !document.body) {
        console.error('Document head or body not available');
        return;
    }

    // Create the mask element
    const mask = document.createElement('div');
    mask.id = 'clickMask';

    // Insert CSS styles for the mask
    const style = document.createElement('style');
    style.id = 'clickMaskStyle';  // Add an id to reference it later
    style.innerHTML = `
      #clickMask {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0); /* Semi-transparent mask */
        z-index: 9999;
        cursor: not-allowed;
        pointer-events: all; /* Ensure the mask captures all events */
      }

      /* Prevent clicks and hovers on everything behind the mask */
      body * {
        pointer-events: none !important; /* Disable click and hover events on all elements */
      }

      /* Allow focusable elements to still work (e.g., inputs, buttons) */
      input, button, textarea, select {
        pointer-events: auto !important; /* Enable interaction for form elements */
      }

      /* Specifically block links (<a>) from being clicked */
      a {
        pointer-events: none !important; /* Block any clicks on links */
      }

      #clickMask {
        pointer-events: all; /* Enable interaction on the mask itself */
      }
    `;

    // Append the style to the head and mask to the body
    document.head.appendChild(style);
    document.body.appendChild(mask);

    // Prevent clicks and other events on the mask itself
    mask.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();

    });

    // Optional: Block other interactions like keypresses if needed
    mask.addEventListener('keydown', (e) => {
        e.stopPropagation();
        e.preventDefault();

    });
}

function removeClickMask() {
    const mask = document.getElementById('clickMask');
    const style = document.getElementById('clickMaskStyle');

    if (mask) {
        mask.remove();
    }

    if (style) {
        style.remove(); // Remove the injected style
    }

}


// Function to add the blur overlay
function addBlurOverlay(blurPx, blurTime) {
    if (!blurOverlay) { // Check if the overlay does not already exist
        blurOverlay = document.createElement('div');
        blurOverlay.style.position = 'fixed';
        blurOverlay.style.top = '0';
        blurOverlay.style.left = '0';
        blurOverlay.style.width = '100%';
        blurOverlay.style.height = '100%';
        blurOverlay.style.zIndex = '2147483647';
        blurOverlay.style.backdropFilter = `blur(${blurPx}px)`;
        blurOverlay.style.transition = `backdrop-filter ${blurTime}s ease`;
        blurOverlay.style.pointerEvents = 'none'; // Optional: Allows clicks to pass through
        document.body.appendChild(blurOverlay);
    }
}

// Function to remove the blur overlay
function removeBlurOverlay() {
    if (blurOverlay) {
        blurOverlay.remove(); // Removes the overlay from the DOM
        blurOverlay = null; // Clear the reference
    }
}