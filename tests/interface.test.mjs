import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';

test('application shell renders dashboard, navigation, research matrix and console',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/<script(?![^>]*type="module"[^>]*src=)/i);assert.match(html,/SYNTHETIC DATA/);
  const window=new Window({url:'https://training.invalid/hacksite-Vantage/#/'});window.document.write(html);
  Object.assign(globalThis,{window,document:window.document,location:window.location,localStorage:window.localStorage,sessionStorage:window.sessionStorage,addEventListener:window.addEventListener.bind(window)});
  Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
  window.scrollTo=()=>{};await import(`../public/app.mjs?test=${Date.now()}`);await window.__vantageReady;
  assert.match(window.document.title,/Operations Overview/);assert.match(window.document.querySelector('#main').textContent,/Orbit is nominal/);assert.equal(window.document.querySelectorAll('#primary-nav a').length,9);
  window.location.hash='#/console';window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  assert.ok(window.document.querySelector('#preset-select'));assert.equal(window.document.querySelectorAll('#preset-select option').length,19);assert.match(window.document.querySelector('#main').textContent,/Bounded emulator/);
  window.document.querySelector('#lab-open').click();assert.equal(window.document.querySelector('#lab-drawer').getAttribute('aria-hidden'),'false');assert.equal(window.document.querySelectorAll('.mission-card').length,10);
});

test('styles include responsive and reduced-motion safeguards',async()=>{const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);assert.match(css,/:focus-visible/)});
