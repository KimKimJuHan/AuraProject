// frontend/src/utils/storage.js

const isStorageAvailable = (type) => {
  try {
    const storage = window[type];
    const x = '__storage_test__';
    storage.setItem(x, x);
    storage.removeItem(x);
    return true;
  } catch (e) {
    return false;
  }
};

const availableLocal = isStorageAvailable('localStorage');
const availableSession = isStorageAvailable('sessionStorage');

const memoryStorage = {};

export const safeLocalStorage = {
  getItem: (key) => {
    if (availableLocal) return localStorage.getItem(key);
    return memoryStorage[key] || null;
  },
  setItem: (key, value) => {
    if (availableLocal) localStorage.setItem(key, value);
    else memoryStorage[key] = value;
  },
  removeItem: (key) => {
    if (availableLocal) localStorage.removeItem(key);
    else delete memoryStorage[key];
  }
};

export const safeSessionStorage = {
  getItem: (key) => {
    if (availableSession) return sessionStorage.getItem(key);
    return null;
  },
  setItem: (key, value) => {
    if (availableSession) sessionStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (availableSession) sessionStorage.removeItem(key);
  },
  clear: () => {
    if (availableSession) sessionStorage.clear();
  }
};