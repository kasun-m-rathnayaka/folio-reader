// Books are generated, not modelled (LIB-4): a hardcover whose faces carry the generated cover, the spine, cream page edges
// and cloth. The geometry is one merged mesh with material groups (see hardcover.js), so a book is one draw call.
import * as THREE from 'three';
import { thicknessCm, BOOK_HEIGHT, BOOK_WIDTH } from './layout.js';
import { hardcoverGeometry, MAT } from './hardcover.js';
import { pageEdgeTexture, shadowTexture } from './textures.js';

export class BookFactory {
    constructor() {
        const edges = pageEdgeTexture();
        this.pages = new THREE.MeshStandardMaterial({ color: 0xF6F4F0, roughness: 0.95, map: edges });
        this.pagesTop = new THREE.MeshStandardMaterial({ color: 0xF6F4F0, roughness: 0.95, map: edges });
        this.placeholder = new THREE.MeshPhysicalMaterial({ color: 0x3a3630, roughness: 0.8, sheen: 0.5, sheenColor: new THREE.Color(0x8a7a62) });
        this.paper = new THREE.MeshStandardMaterial({ color: 0xEFE8D8, roughness: 0.92 });
        this.shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.9 });
        this.geometries = new Map(); this.shadows = new Map();
    }

    geometry(thickness) {
        const key = thickness.toFixed(2);
        if (!this.geometries.has(key)) this.geometries.set(key, hardcoverGeometry(thickness));
        return this.geometries.get(key);
    }

    shadowGeometry(thickness) {
        const key = thickness.toFixed(2);
        if (!this.shadows.has(key)) this.shadows.set(key, new THREE.PlaneGeometry(BOOK_WIDTH * 1.25, thickness * 3 + 3));
        return this.shadows.get(key);
    }

    /** Re-uses a pooled mesh for another book: its geometry and contact shadow follow the new thickness. */
    retarget(mesh, book) {
        const thickness = thicknessCm(book.pages);
        mesh.name = `book:${book.id}`;
        mesh.geometry = this.geometry(thickness);
        mesh.userData.bookId = book.id; mesh.userData.thickness = thickness;
        mesh.userData.shadow.geometry = this.shadowGeometry(thickness);
        mesh.material = this.plainMaterials();
    }

    discard(mesh) { mesh.removeFromParent(); }

    /** Slots in `MAT` order: fore-edge, spine, head, tail, front, back, board, endpaper. */
    plainMaterials() {
        return this.plain ??= [this.pages, this.placeholder, this.pagesTop, this.pagesTop, this.placeholder, this.placeholder, this.placeholder, this.paper];
    }

    /** A book with placeholder materials; the look (spine, cover) is applied later by `materialsFor`. */
    create(book) {
        const thickness = thicknessCm(book.pages);
        const mesh = new THREE.Mesh(this.geometry(thickness), this.plainMaterials());
        mesh.name = `book:${book.id}`;
        mesh.userData = { bookId: book.id, thickness };
        const shadowPlane = new THREE.Mesh(this.shadowGeometry(thickness), this.shadowMaterial);
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = -BOOK_HEIGHT / 2 + 0.02;
        shadowPlane.renderOrder = -1;
        mesh.add(shadowPlane);
        mesh.userData.shadow = shadowPlane;
        return mesh;
    }

    /**
     * Detailed materials for a look: the generated spine, cloth in the book's own colour, and — once the cover has been painted —
     * the front board with foil (title and mark metallic and glossier) and, for cloth covers, a debossed title. Returns the
     * slot array and a disposer; the textures belong to the look.
     */
    materialsFor(look) {
        const cloth = new THREE.Color(look.design.cloth);
        const sheen = cloth.clone().multiplyScalar(0.35);
        const spine = new THREE.MeshPhysicalMaterial({ map: look.spine, roughness: 0.8, sheen: 0.5, sheenColor: sheen });
        const board = new THREE.MeshPhysicalMaterial({ color: cloth, roughness: 0.85, sheen: 0.5, sheenColor: sheen });
        const endpaper = new THREE.MeshStandardMaterial({ color: cloth.clone().lerp(new THREE.Color(0xEFE8D8), 0.62), roughness: 0.9 });
        const cover = look.cover;
        const front = cover
            ? new THREE.MeshPhysicalMaterial({ map: cover.color, roughnessMap: cover.orm, metalnessMap: cover.orm, roughness: 1, metalness: 1, sheen: 0.3, sheenColor: sheen,
                normalMap: cover.normal ?? null, normalScale: new THREE.Vector2(1.2, 1.2) })
            : board;
        const materials = this.plainMaterials().slice();
        materials[MAT.spine] = spine; materials[MAT.front] = front; materials[MAT.back] = board; materials[MAT.board] = board; materials[MAT.endpaper] = endpaper;
        return { materials, dispose: () => { spine.dispose(); board.dispose(); endpaper.dispose(); if (front !== board) front.dispose(); } };
    }

    setShadows(mesh, visible) { if (mesh.userData.shadow) mesh.userData.shadow.visible = visible; }

    dispose() {
        for (const g of this.geometries.values()) g.dispose();
        for (const g of this.shadows.values()) g.dispose();
        this.pages.dispose(); this.pagesTop.dispose(); this.placeholder.dispose(); this.paper.dispose(); this.shadowMaterial.dispose();
    }
}
