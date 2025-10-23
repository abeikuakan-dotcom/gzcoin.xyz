// ===========================
// METAMASK INTEGRATION
// ===========================

// GZ Coin Token Details (BEP20 - BSC Mainnet)
const GZCOIN_TOKEN = {
    address: '0xcac2f4191B50a3781BA939BDd6cBc88C96F540BC',
    symbol: 'GZ',
    decimals: 18,
    image: 'https://i.imgur.com/pjCy64O.png'
};

// BSC Mainnet Configuration
const BSC_MAINNET = {
    chainId: '0x38', // 56 in decimal
    chainName: 'BNB Smart Chain',
    nativeCurrency: {
        name: 'BNB',
        symbol: 'BNB',
        decimals: 18
    },
    rpcUrls: ['https://bsc-dataseed1.binance.org'],
    blockExplorerUrls: ['https://bscscan.com']
};

// Wallet state
let currentAccount = null;
let currentChainId = null;
let currentWalletType = null; // 'metamask' or 'trust'

// Initialize Wallet Integration
function initMetaMask() {
    const connectWalletBtn = document.getElementById('connectWalletBtn');
    const connectWalletNav = document.getElementById('connectWalletNav');
    const connectTrustBtn = document.getElementById('connectTrustBtn');
    const connectTrustNav = document.getElementById('connectTrustNav');
    const disconnectBtn = document.getElementById('disconnectBtn');

    // MetaMask buttons
    if (connectWalletBtn) {
        connectWalletBtn.addEventListener('click', () => connectWallet('metamask'));
    }

    if (connectWalletNav) {
        connectWalletNav.addEventListener('click', () => connectWallet('metamask'));
    }

    // Trust Wallet buttons
    if (connectTrustBtn) {
        connectTrustBtn.addEventListener('click', () => connectWallet('trust'));
    }

    if (connectTrustNav) {
        connectTrustNav.addEventListener('click', () => connectWallet('trust'));
    }

    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', disconnectWallet);
    }

    // Check if already connected
    if (typeof window.ethereum !== 'undefined') {
        window.ethereum.request({ method: 'eth_accounts' })
            .then(accounts => {
                if (accounts.length > 0) {
                    // Detect wallet type
                    if (window.ethereum.isTrust) {
                        currentWalletType = 'trust';
                    } else {
                        currentWalletType = 'metamask';
                    }
                    handleAccountsChanged(accounts);
                }
            })
            .catch(console.error);

        // Listen for account changes
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);
    }
}

// Connect to Wallet (MetaMask or Trust Wallet)
async function connectWallet(walletType = 'metamask') {
    currentWalletType = walletType;
    const walletName = walletType === 'trust' ? 'Trust Wallet' : 'MetaMask';
    
    console.log(`🔌 Connecting to ${walletName}...`);
    
    // Check if wallet extension is installed
    if (typeof window.ethereum === 'undefined') {
        // For Trust Wallet, try mobile deep link
        if (walletType === 'trust') {
            tryTrustWalletMobile();
            return;
        }
        
        showError(`${walletName} is not installed! Please install ${walletName} browser extension to continue.`);
        setTimeout(() => {
            const downloadUrl = walletType === 'trust' 
                ? 'https://trustwallet.com/download' 
                : 'https://metamask.io/download/';
            window.open(downloadUrl, '_blank');
        }, 2000);
        return;
    }

    // Select the correct provider when multiple wallets are installed
    let provider = window.ethereum;
    
    if (walletType === 'metamask') {
        // For MetaMask, prefer the MetaMask provider
        if (window.ethereum.providers) {
            // Multiple wallets detected - find MetaMask
            provider = window.ethereum.providers.find(p => p.isMetaMask && !p.isTrust);
            if (!provider) {
                provider = window.ethereum.providers.find(p => p.isMetaMask);
            }
            if (!provider) {
                showError('MetaMask not found. Please install MetaMask extension.');
                return;
            }
            console.log('✅ Using MetaMask from multiple providers');
        } else if (window.ethereum.isMetaMask && !window.ethereum.isTrust) {
            // Single MetaMask installation
            provider = window.ethereum;
            console.log('✅ Using MetaMask (single provider)');
        } else if (window.ethereum.isTrust) {
            showError('Trust Wallet detected. Please use the Trust Wallet button instead or disable Trust Wallet extension.');
            return;
        }
    } else if (walletType === 'trust') {
        // For Trust Wallet, prefer the Trust Wallet provider
        if (window.ethereum.providers) {
            // Multiple wallets detected - find Trust Wallet
            provider = window.ethereum.providers.find(p => p.isTrust);
            if (!provider && window.trustwallet) {
                provider = window.trustwallet;
            }
            if (!provider) {
                if (isMobile()) {
                    tryTrustWalletMobile();
                    return;
                }
                showError('Trust Wallet not found. Please install Trust Wallet extension.');
                return;
            }
            console.log('✅ Using Trust Wallet from multiple providers');
        } else if (window.ethereum.isTrust) {
            // Single Trust Wallet installation
            provider = window.ethereum;
            console.log('✅ Using Trust Wallet (single provider)');
        } else if (window.trustwallet) {
            provider = window.trustwallet;
            console.log('✅ Using Trust Wallet (fallback)');
        } else {
            if (isMobile()) {
                tryTrustWalletMobile();
                return;
            }
            showError('Trust Wallet not found. Please install Trust Wallet extension.');
            return;
        }
    }

    try {
        hideError();
        updateButtonState('connecting', walletType);

        // Request account access from the selected provider
        const accounts = await provider.request({ 
            method: 'eth_requestAccounts' 
        });

        handleAccountsChanged(accounts);

        // Get chain ID from the selected provider
        const chainId = await provider.request({ method: 'eth_chainId' });
        currentChainId = chainId;
        
        // Store the provider for future use
        window.selectedProvider = provider;

        // Check if on BSC Mainnet, if not, prompt to switch
        if (chainId !== BSC_MAINNET.chainId) {
            const switched = await switchToBSC();
            if (!switched) {
                showError('Please switch to BSC Mainnet to add GZ Coin token.');
                updateButtonState('connected', walletType);
                return;
            }
        }

        // Add token to wallet
        await addTokenToWallet(walletName);

    } catch (error) {
        console.error(`Error connecting to ${walletName}:`, error);
        updateButtonState('disconnected', walletType);
        
        if (error.code === 4001) {
            showError(`Connection rejected. Please approve the connection request in ${walletName}.`);
        } else {
            showError(`Failed to connect to ${walletName}. Please try again.`);
        }
    }
}

// Try Trust Wallet mobile deep link
function tryTrustWalletMobile() {
    const dappUrl = window.location.href;
    const trustDeepLink = `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(dappUrl)}`;
    
    showError('Redirecting to Trust Wallet mobile app...');
    setTimeout(() => {
        window.location.href = trustDeepLink;
    }, 1000);
}

// Check if mobile device
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Switch to BSC Mainnet
async function switchToBSC() {
    const provider = window.selectedProvider || window.ethereum;
    
    try {
        // Try to switch to BSC Mainnet
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BSC_MAINNET.chainId }],
        });
        return true;
    } catch (switchError) {
        // This error code indicates that the chain has not been added to the wallet
        if (switchError.code === 4902) {
            try {
                // Add BSC Mainnet to the wallet
                await provider.request({
                    method: 'wallet_addEthereumChain',
                    params: [BSC_MAINNET],
                });
                return true;
            } catch (addError) {
                console.error('Error adding BSC network:', addError);
                return false;
            }
        } else if (switchError.code === 4001) {
            // User rejected the request
            console.log('User rejected network switch');
            return false;
        }
        console.error('Error switching network:', switchError);
        return false;
    }
}

// Add GZ Coin token to Wallet
async function addTokenToWallet(walletName = 'wallet') {
    const provider = window.selectedProvider || window.ethereum;
    
    try {
        // Prepare token options
        const tokenOptions = {
            address: GZCOIN_TOKEN.address,
            symbol: GZCOIN_TOKEN.symbol,
            decimals: GZCOIN_TOKEN.decimals,
        };

        // Only add image if it exists and is valid
        if (GZCOIN_TOKEN.image && GZCOIN_TOKEN.image.trim() !== '') {
            tokenOptions.image = GZCOIN_TOKEN.image;
        }

        console.log('🔄 Adding token to', walletName, 'with options:', tokenOptions);

        const wasAdded = await provider.request({
            method: 'wallet_watchAsset',
            params: {
                type: 'ERC20',
                options: tokenOptions,
            },
        });

        if (wasAdded) {
            console.log(`GZ Coin token added to ${walletName}!`);
            showTokenAdded();
        } else {
            console.log(`GZ Coin token not added to ${walletName}`);
        }
    } catch (error) {
        console.error('Error adding token:', error);
        console.error('Error details:', {
            code: error.code,
            message: error.message,
            data: error.data
        });
        // Don't show error for token addition failure - it's optional
    }
}

// Handle account changes
function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        // User disconnected
        disconnectWallet();
    } else if (accounts[0] !== currentAccount) {
        currentAccount = accounts[0];
        updateWalletUI(accounts[0]);
        updateButtonState('connected');
    }
}

// Handle chain changes
function handleChainChanged(chainId) {
    currentChainId = chainId;
    updateNetworkDisplay(chainId);
}

// Disconnect wallet
function disconnectWallet() {
    currentAccount = null;
    currentChainId = null;
    updateButtonState('disconnected');
    hideWalletStatus();
    hideTokenAdded();
}

// Update wallet UI
function updateWalletUI(address) {
    const walletStatus = document.getElementById('walletStatus');
    const walletAddress = document.getElementById('walletAddress');
    const walletNetwork = document.getElementById('walletNetwork');

    if (walletAddress) {
        walletAddress.textContent = `Address: ${formatAddress(address)}`;
    }

    if (walletNetwork && currentChainId) {
        walletNetwork.textContent = `Network: ${getNetworkName(currentChainId)}`;
    }

    if (walletStatus) {
        walletStatus.style.display = 'flex';
    }
}

// Update button states
function updateButtonState(state, walletType = null) {
    const connectWalletBtn = document.getElementById('connectWalletBtn');
    const connectWalletNav = document.getElementById('connectWalletNav');
    const connectTrustBtn = document.getElementById('connectTrustBtn');
    const connectTrustNav = document.getElementById('connectTrustNav');

    // Determine which wallet we're working with
    const activeWalletType = walletType || currentWalletType || 'metamask';
    const isMetaMask = activeWalletType === 'metamask';
    const isTrust = activeWalletType === 'trust';

    if (state === 'connecting') {
        if (isMetaMask && connectWalletBtn) {
            connectWalletBtn.disabled = true;
            connectWalletBtn.querySelector('.wallet-text').textContent = 'Connecting...';
        }
        if (isMetaMask && connectWalletNav) {
            connectWalletNav.disabled = true;
            connectWalletNav.querySelector('.wallet-text').textContent = 'Connecting...';
        }
        if (isTrust && connectTrustBtn) {
            connectTrustBtn.disabled = true;
            connectTrustBtn.querySelector('.wallet-text').textContent = 'Connecting...';
        }
        if (isTrust && connectTrustNav) {
            connectTrustNav.disabled = true;
            connectTrustNav.querySelector('.wallet-text').textContent = 'Connecting...';
        }
    } else if (state === 'connected') {
        // Hide both main buttons, show connected in nav
        if (connectWalletBtn) connectWalletBtn.style.display = 'none';
        if (connectTrustBtn) connectTrustBtn.style.display = 'none';
        
        if (isMetaMask && connectWalletNav) {
            connectWalletNav.classList.add('connected');
            connectWalletNav.querySelector('.wallet-text').textContent = formatAddress(currentAccount);
        }
        if (isTrust && connectTrustNav) {
            connectTrustNav.classList.add('connected');
            connectTrustNav.querySelector('.wallet-text').textContent = formatAddress(currentAccount);
        }
    } else {
        // Disconnected state - reset all buttons
        if (connectWalletBtn) {
            connectWalletBtn.disabled = false;
            connectWalletBtn.style.display = 'inline-flex';
            connectWalletBtn.querySelector('.wallet-text').textContent = 'Connect MetaMask';
        }
        if (connectTrustBtn) {
            connectTrustBtn.disabled = false;
            connectTrustBtn.style.display = 'inline-flex';
            connectTrustBtn.querySelector('.wallet-text').textContent = 'Connect Trust Wallet';
        }
        if (connectWalletNav) {
            connectWalletNav.disabled = false;
            connectWalletNav.classList.remove('connected');
            connectWalletNav.querySelector('.wallet-text').textContent = 'MetaMask';
        }
        if (connectTrustNav) {
            connectTrustNav.disabled = false;
            connectTrustNav.classList.remove('connected');
            connectTrustNav.querySelector('.wallet-text').textContent = 'Trust';
        }
    }
}

// Helper functions
function formatAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

function getNetworkName(chainId) {
    const networks = {
        '0x38': 'BSC Mainnet ✓',
        '0x61': 'BSC Testnet',
        '0x1': 'Ethereum Mainnet',
        '0x89': 'Polygon Mainnet',
        '0xaa36a7': 'Sepolia Testnet',
        '0x5': 'Goerli Testnet',
    };
    return networks[chainId] || `Chain ID: ${chainId}`;
}

function updateNetworkDisplay(chainId) {
    const walletNetwork = document.getElementById('walletNetwork');
    if (walletNetwork) {
        walletNetwork.textContent = `Network: ${getNetworkName(chainId)}`;
    }
}

function hideWalletStatus() {
    const walletStatus = document.getElementById('walletStatus');
    if (walletStatus) {
        walletStatus.style.display = 'none';
    }
}

function showTokenAdded() {
    const tokenAdded = document.getElementById('tokenAdded');
    if (tokenAdded) {
        tokenAdded.style.display = 'block';
        // Auto-hide after 10 seconds
        setTimeout(() => {
            tokenAdded.style.display = 'none';
        }, 10000);
    }
}

function hideTokenAdded() {
    const tokenAdded = document.getElementById('tokenAdded');
    if (tokenAdded) {
        tokenAdded.style.display = 'none';
    }
}

function showError(message) {
    const walletError = document.getElementById('walletError');
    const errorMessage = document.getElementById('errorMessage');
    
    if (walletError && errorMessage) {
        errorMessage.textContent = message;
        walletError.style.display = 'block';
    }
}

function hideError() {
    const walletError = document.getElementById('walletError');
    if (walletError) {
        walletError.style.display = 'none';
    }
}

// ===========================
// MOBILE MENU
// ===========================

const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
const navLinks = document.querySelector('.nav-links');

if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        mobileMenuToggle.classList.toggle('active');
    });

    // Close mobile menu when clicking on a link
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
            mobileMenuToggle.classList.remove('active');
        });
    });
}

// ===========================
// WAITLIST FORM
// ===========================

const waitlistForm = document.getElementById('waitlistForm');
const successMessage = document.getElementById('successMessage');
const emailInput = document.getElementById('emailInput');

if (waitlistForm) {
    waitlistForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const email = emailInput.value;
        
        // Here you would typically send the email to your backend
        // For now, we'll just show the success message
        console.log('Email submitted:', email);
        
        // Hide the form
        waitlistForm.style.display = 'none';
        
        // Show success message
        successMessage.classList.add('show');
        
        // Optional: Store in localStorage
        localStorage.setItem('gzcoin_waitlist_email', email);
        
        // Optional: Send to your backend/email service
        // fetch('/api/waitlist', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ email })
        // });
    });
}

// Check if user already signed up
window.addEventListener('DOMContentLoaded', () => {
    const savedEmail = localStorage.getItem('gzcoin_waitlist_email');
    if (savedEmail && waitlistForm && successMessage) {
        waitlistForm.style.display = 'none';
        successMessage.classList.add('show');
    }

    // Initialize MetaMask
    initMetaMask();
});

// ===========================
// ANIMATED COUNTERS
// ===========================

function animateCounter(element, target, duration = 2000) {
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = formatNumber(target);
            clearInterval(timer);
        } else {
            element.textContent = formatNumber(Math.floor(current));
        }
    }, 16);
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M+';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(0) + 'K+';
    }
    return num.toString();
}

// Intersection Observer for Stats Animation
const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const statNumbers = entry.target.querySelectorAll('.stat-number');
            statNumbers.forEach(stat => {
                const target = parseInt(stat.getAttribute('data-target'));
                animateCounter(stat, target);
            });
            statsObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });

const heroStats = document.querySelector('.hero-stats');
if (heroStats) {
    statsObserver.observe(heroStats);
}

// ===========================
// SMOOTH SCROLLING
// ===========================

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const navbarHeight = document.querySelector('.navbar').offsetHeight;
            const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navbarHeight;
            
            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// ===========================
// NAVBAR EFFECTS
// ===========================

const navbar = document.querySelector('.navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
        navbar.style.background = 'rgba(0, 0, 0, 0.98)';
        navbar.style.boxShadow = '0 2px 20px rgba(0, 217, 255, 0.1)';
    } else {
        navbar.style.background = 'rgba(0, 0, 0, 0.95)';
        navbar.style.boxShadow = 'none';
    }

    lastScroll = currentScroll;
});

// ===========================
// FADE-IN ANIMATIONS
// ===========================

const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Apply fade-in animation to impact cards and features
document.querySelectorAll('.impact-card, .feature-item').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    fadeObserver.observe(el);
});

// Add stagger effect to impact cards
document.querySelectorAll('.impact-card').forEach((card, index) => {
    card.style.transitionDelay = `${index * 0.1}s`;
});

// ===========================
// PARALLAX EFFECT
// ===========================

window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const heroBackground = document.querySelector('.hero-background');
    if (heroBackground) {
        heroBackground.style.transform = `translateY(${scrolled * 0.5}px)`;
    }
});

// ===========================
// EMAIL VALIDATION
// ===========================

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Enhanced form validation
if (emailInput) {
    emailInput.addEventListener('input', () => {
        if (emailInput.value && !isValidEmail(emailInput.value)) {
            emailInput.style.borderColor = 'rgba(255, 100, 100, 0.5)';
        } else {
            emailInput.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }
    });
}

// ===========================
// CONSOLE MESSAGES
// ===========================

console.log('%c🌍 GZ Coin - Coming Soon!', 'color: #00d9ff; font-size: 20px; font-weight: bold;');
console.log('%cEvery line of code makes a difference. Join us in creating meaningful impact.', 'color: #00ff88; font-size: 14px;');
console.log('%c🚀 Be the first to know when we launch - join our waitlist!', 'color: #00d9ff; font-size: 14px;');
console.log('%c🦊 Connect MetaMask or 🛡️ Trust Wallet to add GZ Coin (BEP20) token on BSC!', 'color: #ff922b; font-size: 14px;');
console.log('%c⚡ Network: BSC Mainnet | Contract: 0xcac2f4191B50a3781BA939BDd6cBc88C96F540BC', 'color: #f0b90b; font-size: 12px;');
