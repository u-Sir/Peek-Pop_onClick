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
        chrome.storage.local.get(Object.keys(configs), storedConfigs => {
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
        chrome.storage.local.set({ [key]: value }, () => {
            resolve();
        });
    });
}



// Initialize the extension
chrome.runtime.onInstalled.addListener(() => {
    loadUserConfigs().then(userConfigs => {
        const setBrowserInfo = new Promise((resolve, reject) => {
            try {
                chrome.runtime.getBrowserInfo((browserInfo) => {
                    if (browserInfo.name === 'Firefox') {
                        userConfigs['isFirefox'] = true;
                    } else {
                        userConfigs['isFirefox'] = false;
                    }
                    resolve();
                });
            } catch (error) {
                userConfigs['isFirefox'] = false;
                resolve();
            }
        });

        setBrowserInfo.then(() => {
            const keysToSave = Object.keys(configs).filter(key => userConfigs[key] === undefined);
            return Promise.all(keysToSave.map(key => saveConfig(key, configs[key])));
        }).catch(error => console.error('Error during installation setup:', error));
    });
});


// Handle incoming messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    new Promise((resolve, reject) => {
        chrome.windows.getCurrent(window => {
            if (chrome.runtime.lastError) {
                console.error('Error getting current window:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
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
                chrome.storage.local.get('popupWindowsInfo', (result) => {
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
                                        if (!popupWindowsInfo[originWindowId]) {
                                            popupWindowsInfo[originWindowId] = {};
                                        }
                                        popupWindowsInfo[originWindowId][currentWindow.id] = {
                                            windowType: currentWindow.type,
                                            top: currentWindow.top,
                                            left: currentWindow.left,
                                            width: currentWindow.width,
                                            height: currentWindow.height
                                        };



                                        // Handle domain-specific saving
                                        if (userConfigs.rememberPopupSizeAndPositionForDomain && sender && sender.tab && sender.tab.url) {
                                            try {
                                                const domain = new URL(sender.tab.url).hostname;
                                                if (!popupWindowsInfo['savedPositionAndSize']) {
                                                    popupWindowsInfo['savedPositionAndSize'] = {};
                                                }


                                                if (popupWindowsInfo.savedPositionAndSize) {
                                                    popupWindowsInfo.savedPositionAndSize.left = currentWindow.left;
                                                    popupWindowsInfo.savedPositionAndSize.top = currentWindow.top;
                                                    popupWindowsInfo.savedPositionAndSize.width = currentWindow.width;
                                                    popupWindowsInfo.savedPositionAndSize.height = currentWindow.height;

                                                } else {
                                                    popupWindowsInfo.savedPositionAndSize = {
                                                        top: currentWindow.top,
                                                        left: currentWindow.left,
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
                                                    top: currentWindow.top,
                                                    left: currentWindow.left,
                                                    width: currentWindow.width,
                                                    height: currentWindow.height
                                                };
                                            } catch (error) {
                                                console.error('Invalid URL for domain extraction:', error);
                                            }
                                        }

                                        chrome.storage.local.set({ popupWindowsInfo }, () => {

                                            // addBoundsChangeListener(sender.tab.url, currentWindow.id, originWindowId);
                                            chrome.windows.onRemoved.addListener(windowRemovedListener);
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
                chrome.storage.local.get(['popupWindowsInfo'], (result) => {
                    const popupWindowsInfo = result.popupWindowsInfo;
                    const isCurrentWindowOriginal = Object.keys(popupWindowsInfo).some(windowId => {
                        return parseInt(windowId) === currentWindow.id;
                    });
                    if (!isCurrentWindowOriginal) {
                        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            if (tabs.length > 0) {
                                const currentTab = tabs[0];
                                chrome.tabs.remove(currentTab.id);
                            }
                        });
                    }

                });
                sendResponse({ status: 'esc handled' });

            }

            if (request.action === 'windowRegainedFocus') {
                chrome.storage.local.get(['popupWindowsInfo'], (result) => {
                    const popupWindowsInfo = result.popupWindowsInfo;
                    const isCurrentWindowOriginal = Object.keys(popupWindowsInfo).some(windowId => {
                        return parseInt(windowId) === currentWindow.id;
                    });
                    if (isCurrentWindowOriginal) {

                        let popupsToRemove = Object.keys(popupWindowsInfo[currentWindow.id] || {});


                        chrome.windows.getAll({ populate: true }, windows => {
                            windows.forEach(window => {
                                if (popupsToRemove.includes(window.id.toString())) {
                                    chrome.windows.remove(window.id, () => {
                                        if (chrome.runtime.lastError) {
                                            // console.error("Error removing window: ", chrome.runtime.lastError.message);
                                        } else {
                                            // console.log("Window removed successfully.");
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
                chrome.storage.local.get(['previewModeEnable'], userConfigs => {
                    chrome.windows.getCurrent({ populate: true }, (window) => {
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
                            chrome.tabs.create(createData, () => {
                                chrome.windows.get(sender.tab.windowId, window => {
                                    if (window.id) {
                                        chrome.windows.remove(sender.tab.windowId, () => {
                                            if (chrome.runtime.lastError) {
                                                // console.error("Error removing window: ", chrome.runtime.lastError.message);
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
                        chrome.tabs.getZoom(tabId, (zoom) => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                            } else {
                                resolve(zoom);
                            }
                        });
                    } else {
                        // If sender.tab.id is undefined, query the active tab
                        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            if (chrome.runtime.lastError) {
                                return reject(chrome.runtime.lastError);
                            }
                            if (tabs.length > 0) {
                                const currentTab = tabs[0];
                                chrome.tabs.getZoom(currentTab.id, (zoom) => {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
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
                        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            if (chrome.runtime.lastError) {
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
                chrome.storage.local.get(['popupWindowsInfo'], result => {
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
    chrome.storage.local.get(['enableContainerIdentify', 'rememberPopupSizeAndPositionForDomain'], (result) => {
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
            }
        } else {
            savedPositionAndSize = false;
        }
        chrome.windows.create({
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
            if (chrome.runtime.lastError) {
                console.error('Error creating popup window:', chrome.runtime.lastError.message, chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } else {
                updatePopupInfoAndListeners(linkUrl, newWindow, originWindowId, popupWindowsInfo, rememberPopupSizeAndPosition, result.rememberPopupSizeAndPositionForDomain, resolve, reject);
            }
        });


    });

}

// Function to handle default popup creation
function defaultPopupCreation(trigger, linkUrl, tab, currentWindow, defaultWidth, defaultHeight, lastScreenTop, lastScreenLeft, lastScreenWidth, lastScreenHeight, windowType, popupWindowsInfo, rememberPopupSizeAndPosition, resolve, reject) {
    let dx, dy;


    const screenWidth = lastScreenWidth || screen.width;
    const screenHeight = lastScreenHeight || screen.height;

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
    popupWindowsInfo[originWindowId][newWindow.id] = {
        windowType: newWindow.type,
        top: newWindow.top,
        left: newWindow.left,
        width: newWindow.width,
        height: newWindow.height,
        focused: newWindow.focused
    };

    if (rememberPopupSizeAndPosition) {
        if (popupWindowsInfo.savedPositionAndSize) {
            popupWindowsInfo.savedPositionAndSize.left = newWindow.left;
            popupWindowsInfo.savedPositionAndSize.top = newWindow.top;
            popupWindowsInfo.savedPositionAndSize.width = newWindow.width;
            popupWindowsInfo.savedPositionAndSize.height = newWindow.height;
        }

    }


    // Handle domain-specific saving
    if (rememberPopupSizeAndPositionForDomain) {
        try {
            const domain = new URL(linkUrl).hostname;
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
                top: newWindow.top,
                left: newWindow.left,
                width: newWindow.width,
                height: newWindow.height
            };
        } catch (error) {
            console.error('Invalid URL for domain extraction:', error);
        }
    }

    chrome.storage.local.set({ popupWindowsInfo }, () => {
        // addBoundsChangeListener(linkUrl, newWindow.id, originWindowId);
        chrome.windows.onRemoved.addListener(windowRemovedListener);
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
    chrome.storage.local.get('popupWindowsInfo', (result) => {
        const popupWindowsInfo = result.popupWindowsInfo || {};

        for (const originWindowId in popupWindowsInfo) {
            if (popupWindowsInfo[originWindowId][windowId]) {
                delete popupWindowsInfo[originWindowId][windowId];

                if (Object.keys(popupWindowsInfo[originWindowId]).length === 0) {
                    delete popupWindowsInfo[originWindowId];
                }

                chrome.storage.local.set({ popupWindowsInfo });
                break;
            }
        }
    });
}