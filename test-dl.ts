import { shelbyClient } from './src/shelbyClient';

async function test() {
  const downloaded = await shelbyClient.download({ account: "0x123", blobName: "test" }).catch(e => e);
  console.log("downloaded type:", typeof downloaded);
  if (downloaded && typeof downloaded === 'object') {
    console.log("keys:", Object.keys(downloaded));
    console.log("has readable:", 'readable' in downloaded);
    console.log("has stream:", typeof downloaded.stream === 'function');
    console.log("has arrayBuffer:", typeof downloaded.arrayBuffer === 'function');
  }
}
test();
