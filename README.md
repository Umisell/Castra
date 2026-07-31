# Castra 🚀

Castra is a decentralized social storage dApp built on the **Aptos Testnet**. It leverages Aptos identity and the Shelby protocol for secure, encrypted social data casts (posts). It also features **Castra Compose AI** to help you draft polished and natural social updates effortlessly.

## ✨ Features
- **Decentralized Storage**: Integrates with Shelby protocol and Aptos for reliable, on-chain data persistence.
- **Privacy-First**: Focuses on secure and encrypted casts for user privacy. 
- **AI-Powered Composition**: Draft polished casts quickly with the built-in AI composer (powered by OpenAI).
- **Modern UI/UX**: Built with React, TypeScript, and Vite for a lightning-fast and responsive user experience.
- **Production-Ready Security**: Console logs and debuggers are automatically disabled in the production environment to prevent accidental data leaks.

## 🛠️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm, yarn, or pnpm
- An Aptos Wallet (e.g., [Petra Wallet](https://petra.app/)) for interacting with the Aptos Testnet.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Umisell/Castra.git
   cd Castra
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Copy `.env.example` to `.env` and fill in the required keys:
   ```bash
   cp .env.example .env
   ```
   > **Note:** Never commit your `.env` file! The `.gitignore` is already configured to prevent this.

4. Run the development server:
   ```bash
   npm run dev
   ```

## 💻 Tech Stack
- **Frontend**: React 19, TypeScript, Vite
- **Blockchain integration**: `@aptos-labs/ts-sdk`, `@aptos-labs/wallet-adapter-react`
- **Storage/Protocol**: `@shelby-protocol/sdk`, `@shelby-protocol/react`
- **AI**: OpenAI API

## 🔒 Security & Privacy
- Sensitive keys and user data are strictly handled.
- In production mode, all `console` outputs (logs, warnings, errors) are stripped at build-time using `esbuild` and overridden at runtime, ensuring no debugging information is exposed to end users.

## 📄 License
This project is licensed under the MIT License.
