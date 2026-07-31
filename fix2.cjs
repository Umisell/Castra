const fs = require('fs');
let content = fs.readFileSync('src/components/LandingPage.tsx', 'utf8');

const mockFunctions = `
  const copyContract = () => alert('Contract copied!');
  const copyAddr = () => alert('Address copied!');
  const mockSend = () => alert('Sending mock transaction...');
  const mockSign = () => alert('Mock signing...');
  const mockDc = () => alert('Disconnected mock.');
  const selectW = (w: string) => alert('Selected wallet: ' + w);
  const mockUpload = () => alert('Uploading mock blob...');
  const mockPremium = () => alert('Upgrading to premium mock...');
`;

content = content.replace('const handleConnect = (e?: React.MouseEvent) => {', mockFunctions + '\n  const handleConnect = (e?: React.MouseEvent) => {');
fs.writeFileSync('src/components/LandingPage.tsx', content);
