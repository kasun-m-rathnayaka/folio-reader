// Books are generated, not modelled (LIB-4): a box whose faces carry the cover, the spine, cream page edges and cloth.
// Local axes: width along x (spine at −x, fore-edge at +x), height along y, thickness along z (front cover at +z).
import * as THREE from 'three';
import { BOOK_HEIGHT, BOOK_WIDTH, thicknessCm } from './layout.js';
import { clothColor, pageEdgeTexture, spineTexture, shadowTexture } from './textures.js';

// BoxGeometry material groups: +x, −x, +y, −y, +z, −z.
const FACE = { foreEdge: 0, spine: 1, top: 2, bottom: 3, front: 4, back: 5 };

export class BookFactory {
    constructor() {
        const edges = pageEdgeTexture();
        this.pages = new THREE.MeshStandardMaterial({ color: 0xEFE8D8, roughness: 0.95, map: edges });
        this.pagesTop = new THREE.MeshStandardMaterial({ color: 0xEFE8D8, roughness: 0.95, map: edges });
        this.placeholder = new THREE.MeshPhysicalMaterial({ color: 0x3a3630, roughness: 0.8, sheen: 0.5, sheenColor: new THREE.Color(0x8a7a62) });
        this.shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.9 });
        this.geometries = new Map();
    }

    geometry(thickness) {
        const key = thickness.toFixed(2);
        if (!this.geometries.has(key)) this.geometries.set(key, new THREE.BoxGeometry(BOOK_WIDTH, BOOK_HEIGHT, thickness));
        return this.geometries.get(key);
    }

    plainMaterials() {
        return this.plain ??= [this.pages, this.placeholder, this.pagesTop, this.pagesTop, this.placeholder, this.placeholder];
    }

    /** A book with placeholder materials; textures are applied later by `dress`. */
    create(book) {
        const thickness = thicknessCm(book.pages);
        const mesh = new THREE.Mesh(this.geometry(thickness), this.plainMaterials());
        mesh.name = `book:${book.id}`;
        mesh.userData = { bookId: book.id, thickness };
        const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(BOOK_WIDTH * 1.25, thickness * 3 + 3), this.shadowMaterial);
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = -BOOK_HEIGHT / 2 + 0.02;
        shadowPlane.renderOrder = -1;
        mesh.add(shadowPlane);
        mesh.userData.shadow = shadowPlane;
        return mesh;
    }

    /** Detailed materials: cover image, generated spine, cloth tinted by the accent. Returns a disposer. */
    dress(mesh, book, cover, accent) {
        const cloth = clothColor(accent);
        const sheen = new THREE.Color(accent || '#8a7a62');
        const spineMap = spineTexture(book, cloth, accent);
        const spine = new THREE.MeshPhysicalMaterial({ map: spineMap, roughness: 0.8, sheen: 0.5, sheenColor: sheen });
        const back = new THREE.MeshPhysicalMaterial({ color: cloth, roughness: 0.8, sheen: 0.5, sheenColor: sheen });
        const front = cover
            ? new THREE.MeshPhysicalMaterial({ map: cover, roughness: 0.8, sheen: 0.5, sheenColor: sheen })
            : back;
        const materials = mesh.material.slice();
        materials[FACE.spine] = spine; materials[FACE.front] = front; materials[FACE.back] = back;
        mesh.material = materials;
        return () => {
            spineMap.dispose(); spine.dispose(); back.dispose(); if (front !== back) front.dispose();
            mesh.material = this.plainMaterials();
        };
    }

    setShadows(mesh, visible) { if (mesh.userData.shadow) mesh.userData.shadow.visible = visible; }

    dispose() {
        for (const g of this.geometries.values()) g.dispose();
        this.pages.dispose(); this.pagesTop.dispose(); this.placeholder.dispose(); this.shadowMaterial.dispose();
    }
}
