# Phone Camera Stream

Stream a phone camera to a computer browser using encrypted peer-to-peer WebRTC video.

## Use

1. Open the site on the computer and choose **Watch on this computer**.
2. Open the same site on the phone and choose **Share this phone's camera**.
3. Enter the eight-character computer code and allow camera access.

On the computer, use the circular capture button beneath the live feed to save the current frame as a full-resolution PNG. Use **Record** to capture the stream, then **Stop** to save it as a WebM video.

The phone preview also includes remote screenshot and recording controls. They tell the computer to capture or record, so the resulting files are saved to the computer's downloads folder.

Tap **Flip camera** on the phone preview at any time to switch between the front and back cameras without ending the stream.

The computer viewer also has a **Flip** button that remotely switches the phone between its front and back cameras.

The **Include microphone audio** option is enabled by default. Audio plays with the live feed and is included automatically in WebM recordings saved on the computer.

The site is static and hosted on GitHub Pages. PeerJS provides connection signaling; camera video flows directly between the two devices and is not uploaded to this repository or a media server. Room codes are temporary and disappear when the page closes.

## Browser support

Use a current version of Chrome, Edge, or Safari. Camera access requires HTTPS, which GitHub Pages provides. Some restrictive corporate, school, VPN, or carrier networks may block direct WebRTC connections.
