import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validPhotoFile} from './photo-codec.mjs';
test('camera HEIC without MIME recognized without pretending it can be decoded',()=>assert.equal(validPhotoFile({name:'capture.HEIC',type:'',size:100}),true));
test('supported raster MIME accepted',()=>{for(const type of ['image/jpeg','image/png','image/webp','image/heic'])assert.equal(validPhotoFile({type,size:100}),true);});
test('SVG and non-image input rejected before decoding',()=>{for(const type of ['image/svg+xml','text/plain','application/pdf'])assert.equal(validPhotoFile({type,size:100}),false);});
test('empty and oversized camera files rejected',()=>{for(const size of [0,8*1024*1024+1])assert.equal(validPhotoFile({type:'image/jpeg',size}),false);});
