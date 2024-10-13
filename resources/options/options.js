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
    'enableContainerIdentify': true
};

document.addEventListener("DOMContentLoaded", init);

function init() {
    loadUserConfigs(setupPage);

    const userLang = navigator.language || navigator.userLanguage;
    if (userLang.startsWith('zh')) {
        document.querySelector('.align-label-1').style.marginBottom = '-2px';
        // Apply styles to labels following radio buttons
        document.querySelectorAll('input[type="radio"] + label').forEach(function (label) {
            label.style.verticalAlign = '1.5%';
            label.style.marginRight = '10px';
        });

        // Apply styles to labels following checkboxes
        document.querySelectorAll('input[type="checkbox"] + label').forEach(function (label) {
            label.style.verticalAlign = '2.5%';
            label.style.marginLeft = '4px';
            label.style.marginRight = '20px';
        });
    }

}


function setupPage(userConfigs) {
    userConfigs = userConfigs || {};
    // Elements to translate and set labels for
    const elementsToTranslate = [
        { id: 'blacklistSettings', messageId: 'blacklistSettings' },
        { id: 'popupSettings', messageId: 'popupSettings' },

        { id: 'blurEffectSettings', messageId: 'blurEffectSettings' },

        { id: 'previewModeBlacklist', messageId: 'blacklist' }


    ];

    elementsToTranslate.forEach(({ id, messageId }) => setTextContent(id, messageId));

    // Set specific labels
    setInputLabel('noneKey', 'noneKey');

    setInputLabel('previewModeNormal', 'normal');

    setInputLabel('previewModeWindowType', 'windowType');

    setInputLabel('doubleTapKeyToSendPageBack', 'doubleTapKeyToSendPageBack');

    // Initialize input elements
    Object.keys(configs).forEach(key => {
        const input = document.getElementById(key);
        if (input) {
            initializeInput(input, key, userConfigs[key]);
            addInputListener(input, key);
        }
    });

    // Initialize textarea and sliders
    initializeTextarea('linkDisabledUrls', userConfigs);
    initializeTextarea('previewModeDisabledUrls', userConfigs);

    initializeSlider('blurPx', userConfigs.blurPx || 3);
    initializeSlider('blurTime', userConfigs.blurTime || 1);

    // Set modified key
    setupDoubleTapKeyToSendPageBackSelection(userConfigs.doubleTapKeyToSendPageBack);

    // Setup window type selection
    setupPreviewModeWindowTypeSelection(userConfigs.previewModeWindowType);
}

function setTextContent(elementId, messageId) {
    document.getElementById(elementId).textContent = chrome.i18n.getMessage(messageId);
}

function setInputLabel(inputId, messageId) {
    const label = document.querySelector(`label[for="${inputId}"]`);
    if (label) {
        label.textContent = chrome.i18n.getMessage(messageId);
    }
}

function initializeInput(input, key, userConfig) {
    const configValue = userConfig !== undefined ? userConfig : configs[key];
    if (input.type === 'checkbox') {
        input.checked = configValue;
    } else {
        input.value = configValue;
    }

    const label = input.parentNode.querySelector('label') || createLabel(input, key);
    label.textContent = chrome.i18n.getMessage(key);
}

function createLabel(input, key) {
    const label = document.createElement('label');
    label.setAttribute('for', key);
    input.parentNode.appendChild(label);
    return label;
}

function addInputListener(input, key) {
    input.addEventListener("input", () => {
        configs[key] = input.type === 'checkbox' ? input.checked : input.value;
        saveAllSettings();
    });
}

function initializeTextarea(textareaId, userConfigs) {
    const textarea = document.getElementById(textareaId);
    if (textarea) {
        textarea.value = (userConfigs[textareaId] ?? configs[textareaId]).join('\n');
        textarea.addEventListener('input', () => {
            configs[textareaId] = textarea.value.split('\n').filter(line => line.trim());
            saveAllSettings();
        });
    }
}

function initializeSlider(id, defaultValue) {
    const input = document.getElementById(id);
    const output = document.getElementById(`${id}Output`);
    const initialValue = localStorage.getItem(id) ?? defaultValue;

    input.value = initialValue;
    output.textContent = initialValue;

    input.addEventListener('input', () => {
        output.textContent = input.value;
        localStorage.setItem(id, input.value);
    });

}

function setupPreviewModeWindowTypeSelection(windowType) {
    windowType = windowType ?? 'popup';
    document.querySelector(`input[name="previewModeWindowType"][value="${windowType}"]`).checked = true;

    document.querySelectorAll('input[name="previewModeWindowType"]').forEach(input => {
        input.addEventListener('change', event => {
            const newPreviewModeWindowType = event.target.value;
            chrome.storage.local.set({ previewModeWindowType: newPreviewModeWindowType }, () => {
                configs.previewModeWindowType = newPreviewModeWindowType;
            });
        });
    });
}

function setupDoubleTapKeyToSendPageBackSelection(doubleTapKeyToSendPageBack) {
    doubleTapKeyToSendPageBack = doubleTapKeyToSendPageBack ?? 'Ctrl';
    document.querySelector(`input[name="doubleTapKeyToSendPageBack"][value="${doubleTapKeyToSendPageBack}"]`).checked = true;

    document.querySelectorAll('input[name="doubleTapKeyToSendPageBack"]').forEach(input => {
        input.addEventListener('change', event => {
            const newDoubleTapKeyToSendPageBack = event.target.value;
            chrome.storage.local.set({ doubleTapKeyToSendPageBack: newDoubleTapKeyToSendPageBack }, () => {
                configs.doubleTapKeyToSendPageBack = newDoubleTapKeyToSendPageBack;
            });
        });
    });
}

function loadUserConfigs(callback) {
    const keys = Object.keys(configs);
    chrome.storage.local.get(keys, function (userConfigs) {
        userConfigs.previewModeWindowType = userConfigs.previewModeWindowType ?? configs.previewModeWindowType;

        keys.forEach(key => {
            if (userConfigs[key] !== null && userConfigs[key] !== undefined) {
                configs[key] = userConfigs[key];
            }
        });

        if (callback) callback(userConfigs);
    });
}

function saveConfig(key, value) {
    configs[key] = value;
    let data = {};
    data[key] = value;
    chrome.storage.local.set(data);
}

function saveAllSettings() {
    chrome.storage.local.set(configs);
}