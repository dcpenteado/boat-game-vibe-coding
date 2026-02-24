import * as THREE from 'three';

export class BoatModel {
  constructor(color, isLocal) {
    this.group = new THREE.Group();
    this.color = color;
    this.isLocal = isLocal;
    this.floatOffset = Math.random() * Math.PI * 2;

    this._buildHull(color);
    this._buildDeck();
    this._buildMast();
    this._buildSail(color);
    this._buildCannon();
    this._buildFlag(color);

    // Scale up the boat for better visibility
    this.group.scale.set(1.1, 1.1, 1.1);
  }

  _buildHull(color) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 6);
    shape.bezierCurveTo(1.8, 5, 2.5, 3, 2.5, 0);
    shape.lineTo(2.2, -4);
    shape.bezierCurveTo(1.5, -5.5, -1.5, -5.5, -2.2, -4);
    shape.lineTo(-2.5, 0);
    shape.bezierCurveTo(-2.5, 3, -1.8, 5, 0, 6);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 2.5,
      bevelEnabled: true,
      bevelThickness: 0.4,
      bevelSize: 0.3,
      bevelSegments: 3
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0.2, 0);

    const mat = new THREE.MeshPhongMaterial({
      color,
      specular: 0x333333,
      shininess: 40
    });

    this.hull = new THREE.Mesh(geo, mat);
    this.group.add(this.hull);

    // Dark bottom hull
    const bottomGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 1,
      bevelEnabled: false
    });
    bottomGeo.rotateX(-Math.PI / 2);
    bottomGeo.translate(0, -0.8, 0);
    const bottomMat = new THREE.MeshPhongMaterial({ color: 0x1a1a2e, shininess: 20 });
    this.group.add(new THREE.Mesh(bottomGeo, bottomMat));
  }

  _buildDeck() {
    const deckShape = new THREE.Shape();
    deckShape.moveTo(0, 4.5);
    deckShape.bezierCurveTo(1.2, 3.5, 1.8, 1.5, 1.8, 0);
    deckShape.lineTo(1.5, -3.5);
    deckShape.bezierCurveTo(1, -4.2, -1, -4.2, -1.5, -3.5);
    deckShape.lineTo(-1.8, 0);
    deckShape.bezierCurveTo(-1.8, 1.5, -1.2, 3.5, 0, 4.5);

    const geo = new THREE.ShapeGeometry(deckShape);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
    const deck = new THREE.Mesh(geo, mat);
    deck.position.y = 2.0;
    this.group.add(deck);

    // Deck planks (subtle lines)
    for (let z = -3; z <= 3; z += 1.5) {
      const lineGeo = new THREE.PlaneGeometry(3.2, 0.04);
      lineGeo.rotateX(-Math.PI / 2);
      const lineMat = new THREE.MeshBasicMaterial({ color: 0x6b5010, transparent: true, opacity: 0.4 });
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.position.set(0, 2.02, z);
      this.group.add(line);
    }
  }

  _buildMast() {
    const mastGeo = new THREE.CylinderGeometry(0.12, 0.18, 10, 8);
    const mastMat = new THREE.MeshLambertMaterial({ color: 0x5a3e1b });
    this.mast = new THREE.Mesh(mastGeo, mastMat);
    this.mast.position.set(0, 7, 0.5);
    this.group.add(this.mast);

    // Cross beam
    const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, 4, 6);
    beamGeo.rotateZ(Math.PI / 2);
    const beam = new THREE.Mesh(beamGeo, mastMat);
    beam.position.set(0, 10, 0.5);
    this.group.add(beam);

    // Crow's nest ring
    const ringGeo = new THREE.TorusGeometry(0.4, 0.06, 8, 16);
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, mastMat);
    ring.position.set(0, 11.5, 0.5);
    this.group.add(ring);
  }

  _buildSail(color) {
    // Main sail (quad)
    const sailGeo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      -1.8, 10, 0.5,
       1.8, 10, 0.5,
       1.8,  4, 0.5,
      -1.8, 10, 0.5,
       1.8,  4, 0.5,
      -1.5,  3, 0.5,
    ]);
    sailGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    sailGeo.computeVertexNormals();

    const sailMat = new THREE.MeshLambertMaterial({
      color: 0xfaf0e6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92
    });
    this.sail = new THREE.Mesh(sailGeo, sailMat);
    this.group.add(this.sail);

    // Secondary small sail
    const sail2Geo = new THREE.BufferGeometry();
    const v2 = new Float32Array([
      0, 12, 0.5,
      0,  9.5, 0.5,
      0, 10.5, 3.5,
    ]);
    sail2Geo.setAttribute('position', new THREE.BufferAttribute(v2, 3));
    sail2Geo.computeVertexNormals();
    const sail2Mat = new THREE.MeshLambertMaterial({
      color: 0xfaf0e6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    this.group.add(new THREE.Mesh(sail2Geo, sail2Mat));
  }

  _buildCannon() {
    const cannonGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.5, 8);
    cannonGeo.rotateX(Math.PI / 2);
    const cannonMat = new THREE.MeshPhongMaterial({
      color: 0x2a2a2a,
      specular: 0x555555,
      shininess: 60
    });
    this.cannon = new THREE.Mesh(cannonGeo, cannonMat);
    this.cannon.position.set(0, 2.2, 5);
    this.group.add(this.cannon);

    // Cannon base
    const baseGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8);
    const baseMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, 2.0, 4.2);
    this.group.add(base);
  }

  _buildFlag(color) {
    const flagGeo = new THREE.PlaneGeometry(1.2, 0.8);
    const flagMat = new THREE.MeshLambertMaterial({
      color,
      side: THREE.DoubleSide
    });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(0.7, 11.8, 0.5);
    this.flag = flag;
    this.group.add(flag);
  }

  setShield(active) {
    if (active && !this.shieldMesh) {
      const geo = new THREE.SphereGeometry(8, 16, 12);
      const mat = new THREE.MeshPhongMaterial({
        color: 0x3498db,
        transparent: true,
        opacity: 0.2,
        emissive: 0x3498db,
        emissiveIntensity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      this.shieldMesh = new THREE.Mesh(geo, mat);
      this.shieldMesh.position.y = 3;
      this.group.add(this.shieldMesh);
    } else if (!active && this.shieldMesh) {
      this.group.remove(this.shieldMesh);
      this.shieldMesh.geometry.dispose();
      this.shieldMesh.material.dispose();
      this.shieldMesh = null;
    }
  }

  update(x, z, angle, alive, time) {
    this.group.position.x = x;
    this.group.position.z = z;
    this.group.rotation.y = angle + Math.PI;
    this.group.visible = alive;

    if (alive) {
      // Bobbing
      const t = time + this.floatOffset;
      this.group.position.y = Math.sin(t * 1.5) * 0.4;
      // Gentle roll
      this.group.rotation.z = Math.sin(t * 1.2) * 0.03;
      this.group.rotation.x = Math.sin(t * 0.9) * 0.02;
      // Flag wave
      if (this.flag) {
        this.flag.rotation.y = Math.sin(t * 3) * 0.2;
      }
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
