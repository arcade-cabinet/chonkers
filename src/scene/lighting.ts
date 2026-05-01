/**
 * Scene lighting — HDRI environment + key/fill/rim directional lights.
 *
 * The HDRI provides physically-based ambient lighting and the
 * subtle skylight reflection on the board lacquer. The three
 * directional lights add directional shape: the key catches
 * the wood grain, the fill softens the shadow side, the rim
 * pulls a thin highlight along the puck edges from camera-back.
 */

import * as THREE from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { assetUrl } from "@/utils/assetUrl";
import { ASSETS } from "@/utils/manifest";

export interface LightingHandles {
	readonly key: THREE.DirectionalLight;
	readonly fill: THREE.DirectionalLight;
	readonly rim: THREE.DirectionalLight;
	readonly ambient: THREE.AmbientLight;
}

export async function installLighting(
	scene: THREE.Scene,
	renderer: THREE.WebGLRenderer,
): Promise<LightingHandles> {
	const ambient = new THREE.AmbientLight(0xffffff, 0.4);
	scene.add(ambient);

	const key = new THREE.DirectionalLight(0xfff5e6, 0.9);
	key.position.set(6, 12, 8);
	key.castShadow = true;
	key.shadow.mapSize.set(2048, 2048);
	key.shadow.camera.near = 0.5;
	key.shadow.camera.far = 40;
	key.shadow.camera.left = -10;
	key.shadow.camera.right = 10;
	key.shadow.camera.top = 10;
	key.shadow.camera.bottom = -10;
	key.shadow.bias = -0.0005;
	scene.add(key);

	const fill = new THREE.DirectionalLight(0xb8ccff, 0.35);
	fill.position.set(-7, 6, 4);
	scene.add(fill);

	const rim = new THREE.DirectionalLight(0xffe8cc, 0.45);
	rim.position.set(0, 5, -10);
	scene.add(rim);

	const pmremGenerator = new THREE.PMREMGenerator(renderer);
	pmremGenerator.compileEquirectangularShader();

	try {
		const loader = new EXRLoader();
		const tex = await loader.loadAsync(assetUrl(ASSETS.hdri));
		tex.mapping = THREE.EquirectangularReflectionMapping;
		const envMap = pmremGenerator.fromEquirectangular(tex).texture;
		scene.environment = envMap;
		tex.dispose();
		pmremGenerator.dispose();
	} catch (err) {
		console.warn(
			"[scene] HDRI load failed; falling back to direct lights only",
			err,
		);
		pmremGenerator.dispose();
	}

	return { key, fill, rim, ambient };
}
