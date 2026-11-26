/* MF-071 (Matt, Nov 25 2026): ID front/back files are stored as "{name} ID Front/Back.{ext}". */
import { idUploadStoredName, tidyIdPersonName } from '../js/data/id-upload-name.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(idUploadStoredName({ field: 'id_front', personName: 'Ben Buyer', originalName: 'scan.JPG', mimeType: 'image/jpeg' }) === 'Ben Buyer ID Front.jpg', 'front uploads are named with the person and ID Front.jpg');
ok(idUploadStoredName({ field: 'id_back', personName: 'Ben Buyer', originalName: 'back.png', mimeType: 'image/png' }) === 'Ben Buyer ID Back.png', 'back uploads are named with the person and ID Back.png');
ok(idUploadStoredName({ field: 'id_front', personName: 'Ann Agent', originalName: 'pass.pdf', mimeType: 'application/pdf' }) === 'Ann Agent ID Front.pdf', 'a passport still uses the Front label and keeps the file type');
ok(idUploadStoredName({ field: 'id_document', personName: 'Ben Buyer', originalName: 'old.png', mimeType: 'image/png' }) === 'old.png', 'other ID fields keep the original name');
ok(tidyIdPersonName('  Ben   Buyer  ') === 'Ben Buyer' && !idUploadStoredName({ field: 'id_front', personName: 'A/B', originalName: 'x.png' }).includes('/'), 'names are cleaned');
ok(idUploadStoredName({ field: 'id_front', personName: '', originalName: 'x.png', mimeType: 'image/png' }) === 'Client ID Front.png', 'a missing name falls back to Client');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const deal = await api.createDeal({ street: '20 Name Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc' });
await api.addParticipant(deal.id, 'c-buyer', 'Client-Buyer');
await api.addParticipant(deal.id, 'c-seller', 'Client-Seller');

const parties = (await api.getDeal(deal.id)).participants || (await api.listParticipants?.(deal.id)) || [];
await api.signInDev('u-buyer');
const buyerTask = (await api.listTasks(deal.id)).find((t) => t.templateCode === 'id_upload' && t.assignedRole === 'Client-Buyer' && t.mine);
const buyer = await api.getTask(buyerTask.id);
const buyerName = (buyer.ownerName || 'Ben Buyer').trim();
const fUp = await api.uploadForTask(buyer.id, { name: 'camera-front.jpg', mimeType: 'image/jpeg', size: 8, dataUrl: 'data:image/jpeg;base64,AA==', field: 'id_front' });
const bUp = await api.uploadForTask(buyer.id, { name: 'camera-back.jpg', mimeType: 'image/jpeg', size: 8, dataUrl: 'data:image/jpeg;base64,BB==', field: 'id_back' });
ok(fUp.name === `${buyerName} ID Front.jpg`, `buyer front is stored as "${buyerName} ID Front.jpg", got ${fUp.name}`);
ok(bUp.name === `${buyerName} ID Back.jpg`, `buyer back is stored as "${buyerName} ID Back.jpg", got ${bUp.name}`);

await api.signInDev('u-seller');
const sellerTask = (await api.listTasks(deal.id)).find((t) => t.templateCode === 'id_upload' && t.assignedRole === 'Client-Seller');
const seller = await api.getTask(sellerTask.id);
const sellerName = (seller.ownerName || '').trim();
ok(!!sellerName, 'the seller task has a name on the file');
const sUp = await api.uploadForTask(seller.id, { name: 'seller-pass.png', mimeType: 'image/png', size: 8, dataUrl: 'data:image/png;base64,CC==', field: 'id_front' });
ok(sUp.name === `${sellerName} ID Front.png`, `seller front uses the seller name, got ${sUp.name}`);

console.log(fail ? fail + ' failed' : 'mf-071 id image names passed');
if (fail) process.exit(1);
