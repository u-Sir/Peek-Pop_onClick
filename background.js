const configs = {
    'closeWhenFocusedInitialWindow': true,
    'blurEnable': true,
    'blurPx': 3,
    'blurTime': 1,
    'rememberPopupSizeAndPosition': true,
    'popupWindowsInfo': {},
    'closeByEsc': true,
    'doubleTapKeyToSendPageBack': 'Ctrl',
    'previewModeDisabledUrls': [],
    'previewModeWindowType': 'popup',
    'previewModeEnable': true,
    'doubleClickAsClick': true,
    'rememberPopupSizeAndPositionForDomain': true,
    'isFirefox': false,
    'linkDisabledUrls': [],
    'enableContainerIdentify': true,
};

// Load user configurations from storage
async function loadUserConfigs() {
    return new Promise(resolve => {
        browser.storage.local.get(Object.keys(configs), storedConfigs => {
            const mergedConfigs = { ...configs, ...storedConfigs };
            Object.assign(configs, mergedConfigs);
            resolve(mergedConfigs);
        });
    });
}

// Save a specific configuration
async function saveConfig(key, value) {
    configs[key] = value;
    return new Promise(resolve => {
        browser.storage.local.set({ [key]: value }, () => {
            resolve();
        });
    });
}

browser.runtime.onInstalled.addListener(async () => {
    const storedConfigs = await browser.storage.local.get(Object.keys(configs));
    const mergedConfigs = { ...configs, ...storedConfigs };
    Object.assign(configs, mergedConfigs);

    // 自动把 storage 中缺失的 key 写回
    const keysToSave = Object.keys(configs).filter(k => storedConfigs[k] === undefined);
    if (keysToSave.length > 0) {
        const defaultsToSave = {};
        for (const key of keysToSave) defaultsToSave[key] = configs[key];
        await browser.storage.local.set(defaultsToSave);
    }
});


// Handle incoming messages
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    new Promise((resolve, reject) => {
        browser.windows.getCurrent(window => {
            if (browser.runtime.lastError) {
                console.error('Error getting current window:', browser.runtime.lastError);
                reject(browser.runtime.lastError);
            } else {
                resolve(window);
            }
        });
    }).then(currentWindow => {

        return loadUserConfigs().then(userConfigs => {


            let popupWindowsInfo = userConfigs.popupWindowsInfo || {};


            // Filter out the 'savedPositionAndSize' key
            const filteredPopupWindowsInfo = Object.keys(popupWindowsInfo).reduce((acc, key) => {
                if (key !== 'savedPositionAndSize') {
                    acc[key] = popupWindowsInfo[key];
                }
                return acc;
            }, {});

            // Check if the filtered object is empty
            if (Object.keys(filteredPopupWindowsInfo).length === 0) {
                popupWindowsInfo[currentWindow.id] = {}; // Set the current window ID as the original window ID
                return saveConfig('popupWindowsInfo', popupWindowsInfo).then(() => popupWindowsInfo);
            }


            // If originWindowId is already defined, just return popupWindowsInfo
            return popupWindowsInfo;

        }).then(popupWindowsInfo => {
            if (request.action === 'savePositionSize') {
                browser.storage.local.get('popupWindowsInfo', (result) => {
                    const popupWindowsInfo = result.popupWindowsInfo || {};

                    const isCurrentWindowOriginal = Object.keys(popupWindowsInfo).some(windowId => {
                        return parseInt(windowId) === currentWindow.id;
                    });


                    loadUserConfigs().then(userConfigs => {
                        if (!isCurrentWindowOriginal) {

                            if (userConfigs.rememberPopupSizeAndPosition) {
                                for (const originWindowId in popupWindowsInfo) {
                                    if (originWindowId === 'savedPositionAndSize') {
                                        continue; // Skip the savedPositionAndSize key
                                    }

                                    if (popupWindowsInfo[originWindowId][currentWindow.id]) {
                                        const domain = (popupWindowsInfo[originWindowId][currentWindow.id].originDomain !== new URL(sender.tab.url).hostname)
                                            ? popupWindowsInfo[originWindowId][currentWindow.id].originDomain
                                            : new URL(sender.tab.url).hostname;

                                        if (!popupWindowsInfo[originWindowId]) {
                                            popupWindowsInfo[originWindowId] = {};
                                        }
                                        popupWindowsInfo[originWindowId][currentWindow.id] = {
                                            windowType: currentWindow.type,
                                            top: currentWindow.top * window.devicePixelRatio,
                                            left: currentWindow.left * window.devicePixelRatio,
                                            width: currentWindow.width,
                                            height: currentWindow.height,
                                            originDomain: domain
                                        };



                                        // Handle domain-specific saving
                                        if (userConfigs.rememberPopupSizeAndPositionForDomain && sender && sender.tab && sender.tab.url) {
                                            try {
                                                if (!popupWindowsInfo['savedPositionAndSize']) {
                                                    popupWindowsInfo['savedPositionAndSize'] = {};
                                                }


                                                if (popupWindowsInfo.savedPositionAndSize) {
                                                    popupWindowsInfo.savedPositionAndSize.left = currentWindow.left * window.devicePixelRatio;
                                                    popupWindowsInfo.savedPositionAndSize.top = currentWindow.top * window.devicePixelRatio;
                                                    popupWindowsInfo.savedPositionAndSize.width = currentWindow.width;
                                                    popupWindowsInfo.savedPositionAndSize.height = currentWindow.height;

                                                } else {
                                                    popupWindowsInfo.savedPositionAndSize = {
                                                        top: currentWindow.top * window.devicePixelRatio,
                                                        left: currentWindow.left * window.devicePixelRatio,
                                                        width: currentWindow.width,
                                                        height: currentWindow.height
                                                    };
                                                }

                                                // Ensure domain-specific object exists
                                                if (!popupWindowsInfo['savedPositionAndSize'][domain]) {
                                                    popupWindowsInfo['savedPositionAndSize'][domain] = {};
                                                }
                                                // Store the position and size under the domain
                                                // Update or add the domain-specific position and size
                                                popupWindowsInfo.savedPositionAndSize[domain] = {
                                                    top: currentWindow.top * window.devicePixelRatio,
                                                    left: currentWindow.left * window.devicePixelRatio,
                                                    width: currentWindow.width,
                                                    height: currentWindow.height
                                                };
                                            } catch (error) {
                                                console.error('Invalid URL for domain extraction:', error);
                                            }
                                        }

                                        browser.storage.local.set({ popupWindowsInfo }, () => {

                                            // addBoundsChangeListener(sender.tab.url, currentWindow.id, originWindowId);
                                            browser.windows.onRemoved.addListener(windowRemovedListener);
                                        });
                                    }
                                }
                            }
                        } else {
                            // console.log('not popup window, do nothing')
                        }


                    });
                });

                sendResponse({ status: 'position and size saved' });
            }

            if (request.action === 'closeCurrentTab') {
                browser.storage.local.get(['popupWindowsInfo'], (result) => {
                    // filter out empty objects under popupWindowsInfo
                    const popupWindowsInfo = Object.keys(result.popupWindowsInfo).reduce((acc, key) => {
                        if (Object.keys(result.popupWindowsInfo[key]).length > 0) {
                            acc[key] = result.popupWindowsInfo[key];
                        }
                        return acc;
                    }, {});
                    const isCurrentWindowOriginal = Object.keys(popupWindowsInfo).length === 0 ||
                        (Object.keys(popupWindowsInfo).length === 1 && 'savedPositionAndSize' in popupWindowsInfo) ||
                        Object.keys(popupWindowsInfo).some(windowId => {
                            // Check if windowId exists and popupWindowsInfo[windowId] is empty (no popups)
                            return windowId &&
                                parseInt(windowId) === currentWindow.id &&
                                Object.keys(popupWindowsInfo[windowId]).length === 0;
                        });
                    if (!isCurrentWindowOriginal) {
                        browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            if (tabs.length > 0) {
                                const currentTab = tabs[0];
                                browser.tabs.remove(currentTab.id, () => {
                                    browser.windows.getAll({ populate: false }, (windows) => {
                                        const existingWindowIds = windows.map(win => win.id); // List of all current window IDs

                                        function cleanPopupInfo(info) {
                                            return Object.keys(info).reduce((acc, key) => {
                                                const keyAsInt = parseInt(key, 10);

                                                // Check if key is a valid window ID and clean recursively
                                                if (key === 'savedPositionAndSize' || existingWindowIds.includes(keyAsInt)) {
                                                    acc[key] = (key === 'savedPositionAndSize') ? info[key] : cleanPopupInfo(info[key]); // Recursive cleaning for nested popups
                                                }

                                                return acc;
                                            }, {});
                                        }

                                        const cleanedPopupWindowsInfo = cleanPopupInfo(result.popupWindowsInfo);

                                        // Set the cleaned popupWindowsInfo back to storage
                                        browser.storage.local.set({ popupWindowsInfo: cleanedPopupWindowsInfo });
                                    });
                                });
                            }
                        });
                    }

                });
                sendResponse({ status: 'esc handled' });

            }

            if (request.action === 'windowRegainedFocus') {
                browser.storage.local.get(['popupWindowsInfo'], (result) => {
                    const popupWindowsInfo = result.popupWindowsInfo || {};

                    const isCurrentWindowOriginal = popupWindowsInfo.hasOwnProperty(currentWindow.id);

                    if (isCurrentWindowOriginal) {
                        // Initialize popupsToRemove with the current window's popups
                        let popupsToRemove = new Set(Object.keys(popupWindowsInfo[currentWindow.id] || {}));

                        // Recursive function to find all nested sub-popups
                        const addNestedPopups = (popupId) => {
                            const subPopups = popupWindowsInfo[popupId];
                            if (subPopups) {
                                Object.keys(subPopups).forEach(subPopupId => {
                                    if (!popupsToRemove.has(subPopupId)) {
                                        popupsToRemove.add(subPopupId);
                                        addNestedPopups(subPopupId); // Recurse into further nested sub-popups
                                    }
                                });
                            }
                        };

                        // Add all nested popups for each popup initially in popupsToRemove
                        Array.from(popupsToRemove).forEach(popupId => addNestedPopups(popupId));

                        browser.windows.getAll({ populate: true }, windows => {
                            windows.forEach(window => {
                                if (popupsToRemove.has(window.id.toString())) {
                                    browser.windows.remove(window.id, () => {
                                        if (browser.runtime.lastError) {
                                            // Error handling for window removal
                                        } else {
                                            // Window removed successfully
                                        }
                                    });
                                }
                            });
                        });
                    }
                });
                sendResponse({ status: 'window focus handled' });
            }

            if (request.action === 'updateIcon') {
                browser.storage.local.get(['previewModeEnable'], userConfigs => {
                    browser.windows.getCurrent({ populate: true }, (window) => {
                        if (request.theme === 'dark') {
                            if (userConfigs.previewModeEnable) {
                                if (request.previewMode !== undefined && !request.previewMode) {

                                    browser.action.setIcon({
                                        path: {
                                            "128": "resources/inBlacklist-dark.svg"
                                        }
                                    });
                                } else {

                                    browser.action.setIcon({
                                        path: {
                                            "128": "resources/icon-dark.svg"
                                        }
                                    });
                                }
                            } else {

                                browser.action.setIcon({
                                    path: {
                                        "128": "resources/icon-dark.svg"
                                    }
                                });

                            }
                        } else {
                            if (userConfigs.previewModeEnable) {
                                if (request.previewMode !== undefined && !request.previewMode) {

                                    browser.action.setIcon({
                                        path: {
                                            "128": "resources/inBlacklist.png"
                                        }
                                    });
                                } else {

                                    browser.action.setIcon({
                                        path: {
                                            "128": "resources/icon.svg"
                                        }
                                    });
                                }
                            } else {

                                browser.action.setIcon({
                                    path: {
                                        "128": "resources/icon.svg"
                                    }
                                });

                            }
                        }
                    });

                });


                sendResponse({ status: 'Icon update handled' });
            }




            if (request.action === 'sendPageBack') {
                loadUserConfigs().then(userConfigs => {
                    const { popupWindowsInfo, enableContainerIdentify } = userConfigs;

                    if (popupWindowsInfo && Object.keys(popupWindowsInfo).length > 0) {
                        // Iterate through popupWindowsInfo to find the original window ID
                        let originalWindowId = null;
                        for (const originWindowId in popupWindowsInfo) {
                            if (popupWindowsInfo[originWindowId][sender.tab.windowId]) {
                                originalWindowId = originWindowId;
                                break;
                            }
                        }

                        if (originalWindowId) {
                            const createData = { windowId: parseInt(originalWindowId), url: sender.tab.url };
                            if (enableContainerIdentify && sender.tab.cookieStoreId && sender.tab.cookieStoreId !== 'firefox-default') {
                                createData.cookieStoreId = sender.tab.cookieStoreId;
                            }
                            browser.tabs.create(createData, () => {
                                browser.windows.get(sender.tab.windowId, window => {
                                    if (window.id) {
                                        browser.windows.remove(sender.tab.windowId, () => {
                                            if (browser.runtime.lastError) {
                                                // console.error("Error removing window: ", browser.runtime.lastError.message);
                                            } else {
                                                // console.log("Window removed successfully.");
                                            }
                                        });
                                    }
                                });

                            });
                        } else {
                            //console.error('No original window ID found for current window ID in popupWindowsInfo.');
                        }
                    } else {
                        console.error('popupWindowsInfo is empty or not properly structured.');
                    }
                });
                sendResponse({ status: 'send Page Back handled' });

            }

            const getZoomFactor = () => {
                return new Promise((resolve, reject) => {
                    // Check if sender.tab.id is defined
                    const tabId = sender.tab ? sender.tab.id : null;

                    if (tabId) {
                        // If sender.tab.id is defined, use it to get the zoom factor
                        browser.tabs.getZoom(tabId, (zoom) => {
                            if (browser.runtime.lastError) {
                                reject(browser.runtime.lastError);
                            } else {
                                resolve(zoom);
                            }
                        });
                    } else {
                        // If sender.tab.id is undefined, query the active tab
                        browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            if (browser.runtime.lastError) {
                                return reject(browser.runtime.lastError);
                            }
                            if (tabs.length > 0) {
                                const currentTab = tabs[0];
                                browser.tabs.getZoom(currentTab.id, (zoom) => {
                                    if (browser.runtime.lastError) {
                                        reject(browser.runtime.lastError);
                                    } else {
                                        resolve(zoom);
                                    }
                                });
                            } else {
                                reject('No active tabs found.');
                            }
                        });
                    }
                });
            };


            return getZoomFactor().then(zoom => {
                return Promise.all([
                    saveConfig('lastClientX', request.lastClientX * zoom),
                    saveConfig('lastClientY', request.lastClientY * zoom),
                    saveConfig('lastScreenTop', request.top * zoom),
                    saveConfig('lastScreenLeft', request.left * zoom),
                    saveConfig('lastScreenWidth', request.width * zoom),
                    saveConfig('lastScreenHeight', request.height * zoom)
                ]);
            }).then(() => {
                return loadUserConfigs().then(userConfigs => {
                    const { rememberPopupSizeAndPosition, previewModeWindowType } = userConfigs;
                    let typeToSend;
                    let urls;

                    if (request.trigger === 'click') {
                        typeToSend = previewModeWindowType || 'popup';
                    } else {
                        // console.log(request.action)
                    }
                    if (request.linkUrl) {
                        browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            if (browser.runtime.lastError) {
                                //
                            }
                            if (tabs.length > 0) {
                                let currentTab = tabs[0];
                                if (sender.tab) currentTab = sender.tab;
                                handleLinkInPopup(request.trigger, request.linkUrl, currentTab, currentWindow, rememberPopupSizeAndPosition, typeToSend).then(() => {
                                    // sendResponse({ status: 'link handled' });
                                });
                                sendResponse({ status: 'link handled' });

                            } else {
                                //
                            }
                        });

                    } else {
                        sendResponse({ status: 'message processed' });
                    }
                });
            });
        });
    })
        .catch(error => {
            console.error('Error in background script:', error);
            sendResponse({ status: 'error', message: error.message });
        });

    return true; // Keeps the message channel open for async response
});

// Handle link opening in a popup
function handleLinkInPopup(trigger, linkUrl, tab, currentWindow, rememberPopupSizeAndPosition, windowType) {
    if (!isValidUrl(linkUrl)) {
        console.error('Invalid URL:', linkUrl);
        return Promise.reject(new Error('Invalid URL'));
    }

    return loadUserConfigs().then(userConfigs => {
        const {
            popupHeight, popupWidth,
            lastScreenTop, lastScreenLeft, lastScreenWidth, lastScreenHeight
        } = userConfigs;

        const defaultHeight = parseInt(popupHeight, 10) || 800;
        const defaultWidth = parseInt(popupWidth, 10) || 1000;

        let dx, dy, width = defaultWidth, height = defaultHeight;

        return new Promise((resolve, reject) => {
            if (rememberPopupSizeAndPosition) {
                browser.storage.local.get(['popupWindowsInfo'], result => {
                    const popupWindowsInfo = result.popupWindowsInfo;
                    const savedPositionAndSize = popupWindowsInfo.savedPositionAndSize || {};

                    if (Object.keys(savedPositionAndSize).length > 0) {
                        ({ left: dx, top: dy, width, height } = savedPositionAndSize);

                        createPopupWindow(trigger, linkUrl, tab, windowType, dx, dy, width, height, currentWindow.id, popupWindowsInfo, rememberPopupSizeAndPosition, resolve, reject);
                    } else {
                        defaultPopupCreation(trigger, linkUrl, tab, currentWindow, defaultWidth, defaultHeight, lastScreenTop, lastScreenLeft, lastScreenWidth, lastScreenHeight, windowType, popupWindowsInfo, rememberPopupSizeAndPosition, resolve, reject);
                    }
                });
            } else {
                //
            }
        });
    });
}

// Function to create a popup window
function createPopupWindow(trigger, linkUrl, tab, windowType, left, top, width, height, originWindowId, popupWindowsInfo, rememberPopupSizeAndPosition, resolve, reject) {
    browser.storage.local.get(['enableContainerIdentify', 'rememberPopupSizeAndPositionForDomain'], (result) => {
        const enableContainerIdentify = result.enableContainerIdentify !== undefined ? result.enableContainerIdentify : true;
        let savedPositionAndSize;
        const domain = new URL(linkUrl).hostname;
        // Safely access the saved position and size if `rememberPopupSizeAndPositionForDomain` is enabled
        if (result.rememberPopupSizeAndPositionForDomain && popupWindowsInfo.savedPositionAndSize) {
            if (popupWindowsInfo.savedPositionAndSize[domain]) {
                savedPositionAndSize = {
                    top: popupWindowsInfo.savedPositionAndSize[domain].top,
                    left: popupWindowsInfo.savedPositionAndSize[domain].left,
                    width: popupWindowsInfo.savedPositionAndSize[domain].width,
                    height: popupWindowsInfo.savedPositionAndSize[domain].height,

                };
            } else {
                savedPositionAndSize = {
                    top: popupWindowsInfo.savedPositionAndSize.top,
                    left: popupWindowsInfo.savedPositionAndSize.left,
                    width: popupWindowsInfo.savedPositionAndSize.width,
                    height: popupWindowsInfo.savedPositionAndSize.height,
                };

            }
        } else {
            savedPositionAndSize = false;
        }

        browser.windows.create({
            url: linkUrl,
            type: windowType,
            top: parseInt(savedPositionAndSize ? savedPositionAndSize.top : top),
            left: parseInt(savedPositionAndSize ? savedPositionAndSize.left : left),
            width: parseInt(savedPositionAndSize ? savedPositionAndSize.width : width),
            height: parseInt(savedPositionAndSize ? savedPositionAndSize.height : height),
            focused: true,
            incognito: tab && tab.incognito !== undefined ? tab.incognito : false,
            ...(enableContainerIdentify && tab.cookieStoreId && tab.cookieStoreId !== 'firefox-default' ? { cookieStoreId: tab.cookieStoreId } : {})
        }, (newWindow) => {
            if (browser.runtime.lastError) {
                console.error('Error creating popup window:', browser.runtime.lastError.message, browser.runtime.lastError);
                reject(browser.runtime.lastError);
            } else {

                if (window.devicePixelRatio != 1) {

                    browser.windows.update(newWindow.id, {
                        top: parseInt(savedPositionAndSize ? savedPositionAndSize.top/window.devicePixelRatio : ((top*2+height)/window.devicePixelRatio - height)/2),
                        left: parseInt(savedPositionAndSize ? savedPositionAndSize.left/window.devicePixelRatio : ((left*2+width)/window.devicePixelRatio - width)/2)
                    },(updated)=>{

                        updatePopupInfoAndListeners(linkUrl, updated, originWindowId, popupWindowsInfo, rememberPopupSizeAndPosition, result.rememberPopupSizeAndPositionForDomain, resolve, reject);

                    })
                }
                updatePopupInfoAndListeners(linkUrl, newWindow, originWindowId, popupWindowsInfo, rememberPopupSizeAndPosition, result.rememberPopupSizeAndPositionForDomain, resolve, reject);
            }
        });


    });

}

// Function to handle default popup creation
function defaultPopupCreation(trigger, linkUrl, tab, currentWindow, defaultWidth, defaultHeight, lastScreenTop, lastScreenLeft, lastScreenWidth, lastScreenHeight, windowType, popupWindowsInfo, rememberPopupSizeAndPosition, resolve, reject) {
    let dx, dy;


    const screenWidth = lastScreenWidth || screen.width * window.devicePixelRatio;
    const screenHeight = lastScreenHeight || screen.height * window.devicePixelRatio;

    const centerX = (screenWidth - defaultWidth) / 2;
    const centerY = (screenHeight - defaultHeight) / 2;

    dx = parseInt(lastScreenLeft) + centerX;
    dy = parseInt(lastScreenTop) + centerY;


    // Clamping dx and dy to ensure they are within the screen bounds
    dx = Math.max(lastScreenLeft, Math.min(dx, lastScreenLeft + lastScreenWidth - defaultWidth));
    dy = Math.max(lastScreenTop, Math.min(dy, lastScreenTop + lastScreenHeight - defaultHeight));


    createPopupWindow(trigger, linkUrl, tab, windowType, dx, dy, defaultWidth, defaultHeight, currentWindow.id, popupWindowsInfo, rememberPopupSizeAndPosition, resolve, reject);
}

// Function to update popup info and add listeners
function updatePopupInfoAndListeners(linkUrl, newWindow, originWindowId, popupWindowsInfo, rememberPopupSizeAndPosition, rememberPopupSizeAndPositionForDomain, resolve, reject) {
    if (!popupWindowsInfo[originWindowId]) {
        popupWindowsInfo[originWindowId] = {};
    }
    const domain = new URL(linkUrl).hostname;
    popupWindowsInfo[originWindowId][newWindow.id] = {
        windowType: newWindow.type,
        top: newWindow.top * window.devicePixelRatio,
        left: newWindow.left * window.devicePixelRatio,
        width: newWindow.width,
        height: newWindow.height,
        focused: newWindow.focused,
        originDomain: domain
    };

    if (rememberPopupSizeAndPosition) {
        if (popupWindowsInfo.savedPositionAndSize) {
            popupWindowsInfo.savedPositionAndSize.left = newWindow.left * window.devicePixelRatio;
            popupWindowsInfo.savedPositionAndSize.top = newWindow.top * window.devicePixelRatio;
            popupWindowsInfo.savedPositionAndSize.width = newWindow.width;
            popupWindowsInfo.savedPositionAndSize.height = newWindow.height;
        }

    }


    // Handle domain-specific saving
    if (rememberPopupSizeAndPositionForDomain) {
        try {
            if (!popupWindowsInfo.savedPositionAndSize) {
                popupWindowsInfo.savedPositionAndSize = {};
            }
            // Ensure domain-specific object exists
            if (!popupWindowsInfo.savedPositionAndSize[domain]) {
                popupWindowsInfo.savedPositionAndSize[domain] = {};
            }
            // Store the position and size under the domain
            // Update or add the domain-specific position and size
            popupWindowsInfo.savedPositionAndSize[domain] = {
                top: newWindow.top * window.devicePixelRatio,
                left: newWindow.left * window.devicePixelRatio,
                width: newWindow.width,
                height: newWindow.height
            };
        } catch (error) {
            console.error('Invalid URL for domain extraction:', error);
        }
    }

    browser.storage.local.set({ popupWindowsInfo }, () => {
        // addBoundsChangeListener(linkUrl, newWindow.id, originWindowId);
        browser.windows.onRemoved.addListener(windowRemovedListener);
        resolve();
    });
}

// Function to handle URL validation
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch (_) {
        return false;
    }
}


// Listener for popup window removal
function windowRemovedListener(windowId) {
    browser.storage.local.get('popupWindowsInfo', (result) => {
        const popupWindowsInfo = result.popupWindowsInfo || {};

        for (const originWindowId in popupWindowsInfo) {
            if (popupWindowsInfo[originWindowId][windowId]) {
                delete popupWindowsInfo[originWindowId][windowId];

                if (Object.keys(popupWindowsInfo[originWindowId]).length === 0) {
                    delete popupWindowsInfo[originWindowId];
                }

                browser.storage.local.set({ popupWindowsInfo });
                break;
            }
        }
    });
}
