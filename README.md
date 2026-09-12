# HORN

A pixelated desktop arena shooter for js13k 2026: Unicorns and Rainbows. Survive 60 seconds, then destroy the Warden to win. Collect ground power-ups, build your kill chain, and use rainbow overdrive to push through the fight.

## Play

Open `outputs/horn.html` in a desktop browser. The game runs offline.

- WASD / arrow keys: move
- Mouse: aim; hold left click or X: fire
- Space / Shift: dash
- P / Escape: pause; R: restart
- M: sound; F: fullscreen

Start with five hearts. Heart pickups restore one heart, up to seven.

## Build and test

Requires Node.js, npm, Python 3, and Python's `zopfli` package.

```sh
npm ci
python3 -m pip install zopfli
npm run build
npm run pack
npm test
```

Source: `src/`. Playable build: `outputs/horn.html`. Submission: `outputs/horn.zip` (**13,312 bytes**).

## Credits

Sound synthesis uses [Sonant-X](https://github.com/nicolas-van/sonant-x). See its [license](src/SONANT-X-LICENSE.txt).
