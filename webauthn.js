// webauthn.js - WebAuthn helper functions for biometric authentication
// Note: This is a client-side helper. Backend integration required for production.

const WebAuthnHelper = {
  /**
   * Check if WebAuthn is supported and available
   */
  isSupported() {
    return !!(window.PublicKeyCredential && 
             window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable);
  },
  
  /**
   * Check if platform authenticator (biometrics) is available
   */
  async isBiometricAvailable() {
    if (!this.isSupported()) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  },
  
  /**
   * Register a new biometric credential
   * @param {string} username - User identifier
   * @param {string} challenge - Base64URL-encoded challenge from backend
   */
  async register(username, challenge) {
    if (!this.isSupported()) {
      throw new Error('WebAuthn not supported');
    }
    
    const publicKey = {
      challenge: this.base64urlToBuffer(challenge),
      rp: {
        name: 'Trading-Trip',
        id: location.hostname
      },
      user: {
        id: this.stringToBuffer(username),
        name: username,
        displayName: username
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 } // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        requireResidentKey: false,
        userVerification: 'required'
      },
      timeout: 60000,
      attestation: 'none'
    };
    
    const credential = await navigator.credentials.create({ publicKey });
    return this.convertCredential(credential);
  },
  
  /**
   * Authenticate with existing biometric credential
   * @param {string} challenge - Base64URL-encoded challenge from backend
   * @param {Array<string>} allowCredentials - List of allowed credential IDs
   */
  async authenticate(challenge, allowCredentials = []) {
    if (!this.isSupported()) {
      throw new Error('WebAuthn not supported');
    }
    
    const publicKey = {
      challenge: this.base64urlToBuffer(challenge),
      rpId: location.hostname,
      allowCredentials: allowCredentials.map(id => ({
        type: 'public-key',
        id: this.base64urlToBuffer(id)
      })),
      userVerification: 'required',
      timeout: 60000
    };
    
    const assertion = await navigator.credentials.get({ publicKey });
    return this.convertAssertion(assertion);
  },
  
  /**
   * Convert PublicKeyCredential to JSON-serializable object
   */
  convertCredential(credential) {
    return {
      id: credential.id,
      rawId: this.bufferToBase64url(credential.rawId),
      response: {
        clientDataJSON: this.bufferToBase64url(credential.response.clientDataJSON),
        attestationObject: this.bufferToBase64url(credential.response.attestationObject)
      },
      type: credential.type
    };
  },
  
  /**
   * Convert PublicKeyCredential (assertion) to JSON-serializable object
   */
  convertAssertion(assertion) {
    return {
      id: assertion.id,
      rawId: this.bufferToBase64url(assertion.rawId),
      response: {
        clientDataJSON: this.bufferToBase64url(assertion.response.clientDataJSON),
        authenticatorData: this.bufferToBase64url(assertion.response.authenticatorData),
        signature: this.bufferToBase64url(assertion.response.signature),
        userHandle: assertion.response.userHandle 
          ? this.bufferToBase64url(assertion.response.userHandle) 
          : null
      },
      type: assertion.type
    };
  },
  
  /**
   * Utility: Convert ArrayBuffer to Base64URL string
   */
  bufferToBase64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  },
  
  /**
   * Utility: Convert Base64URL string to ArrayBuffer
   */
  base64urlToBuffer(base64url) {
    const base64 = base64url
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(base64url.length + (4 - base64url.length % 4) % 4, '=');
    
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  },
  
  /**
   * Utility: Convert string to ArrayBuffer
   */
  stringToBuffer(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str).buffer;
  }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebAuthnHelper;
} else {
  window.WebAuthnHelper = WebAuthnHelper;
}

// Auto-detect and log capability on load
document.addEventListener('DOMContentLoaded', () => {
  if (WebAuthnHelper.isSupported()) {
    WebAuthnHelper.isBiometricAvailable().then(available => {
      console.log(`🔐 Biometric auth: ${available ? 'Available' : 'Not available'}`);
      // Update UI to show/hide biometric options
      const authBtn = document.getElementById('biometricAuth');
      if (authBtn && !available) {
        authBtn.title = 'Biometric authentication not available on this device';
        authBtn.style.opacity = '0.5';
        authBtn.disabled = true;
      }
    });
  } else {
    console.warn('⚠️ WebAuthn not supported');
  }
});