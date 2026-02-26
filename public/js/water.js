import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';

export function createWater(scene, renderer, isMobile = false) {
  // --- Sky ---
  const sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 10;
  skyUniforms['rayleigh'].value = 2;
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.8;

  const sun = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(88);
  const theta = THREE.MathUtils.degToRad(200);
  sun.setFromSphericalCoords(1, phi, theta);
  skyUniforms['sunPosition'].value.copy(sun);

  // Update renderer tone mapping with sky
  if (renderer) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const sceneEnv = new THREE.Scene();
    sceneEnv.add(sky.clone());
    const renderTarget = pmremGenerator.fromScene(sceneEnv);
    scene.environment = renderTarget.texture;
    pmremGenerator.dispose();
    sceneEnv.clear();
  }

  // --- Water ---
  const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
  const water = new Water(waterGeometry, {
    textureWidth: isMobile ? 256 : 512,
    textureHeight: isMobile ? 256 : 512,
    waterNormals: new THREE.TextureLoader().load(
      'textures/waternormals.jpg',
      (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      }
    ),
    sunDirection: sun.clone().normalize(),
    sunColor: 0xffffff,
    waterColor: 0x001e0f,
    distortionScale: 3.7,
    fog: scene.fog !== undefined
  });
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  return { water, sun };
}

export function updateWater(waterObj, dt) {
  waterObj.water.material.uniforms['time'].value += dt * 0.6;
}
