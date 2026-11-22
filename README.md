<h1><img src="assets/logo.png" alt="Dupagotchi" width="420"></h1>

A Tamagotchi dupe for desktop. Drag it anywhere on your desktop and care for your pet using the three buttons.

![Dupagotchi gameplay demo](assets/demo-gameplay.png)

- Use A / B / C to play.
- Right-click for sound, pause, and save controls.
- Your progress saves automatically.

The ROM is not included due to copyright. Click **Choose ROM** to import your own Tamagotchi P1 ROM. [🌚]

## Requirements

For building and running from source:

- macOS (Windows is not currently supported).
- Node.js 22.12.0 or newer, with npm.
- Xcode Command Line Tools, including the C compiler. Install with `xcode-select --install` if needed.
- A supported Tamagotchi P1 ROM, imported with **Choose ROM** on first launch.

The packaged macOS app only needs macOS and the ROM; Node.js, npm, and the command line tools are only needed to build from source.

## Run

```sh
npm install
npm start
```

## Install

Build the app from source:

```sh
npm install
npm run package
```

Find the app in `release/` and move it to Applications.

## License

The emulation core uses [TamaLIB](https://github.com/jcrona/tamalib).
