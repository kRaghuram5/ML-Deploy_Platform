import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function Background3D() {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0e1a, 0.001);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 4000);
    camera.position.z = 1000;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Nodes (Particles)
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 350; // Neural nodes count
    const posArray = new Float32Array(particlesCount * 3);
    const velocities = [];

    for (let i = 0; i < particlesCount * 3; i += 3) {
      posArray[i] = (Math.random() - 0.5) * 3000;
      posArray[i + 1] = (Math.random() - 0.5) * 3000;
      posArray[i + 2] = (Math.random() - 0.5) * 3000;

      velocities.push({
        x: (Math.random() - 0.5) * 2.5,
        y: (Math.random() - 0.5) * 2.5,
        z: (Math.random() - 0.5) * 2.5
      });
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

    // Node material
    const particleMaterial = new THREE.PointsMaterial({
      size: 10,
      color: 0x4facfe,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });

    const particleSystem = new THREE.Points(particlesGeometry, particleMaterial);
    scene.add(particleSystem);

    // Lines (Neural connections)
    const linesMaterial = new THREE.LineBasicMaterial({
      color: 0x00f2fe,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending
    });

    // Interaction tracking
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;
    let windowHalfX = window.innerWidth / 2;
    let windowHalfY = window.innerHeight / 2;

    const onDocumentMouseMove = (event) => {
      mouseX = (event.clientX - windowHalfX) * 0.4;
      mouseY = (event.clientY - windowHalfY) * 0.4;
    };

    document.addEventListener('mousemove', onDocumentMouseMove);

    // Resize handler
    const onWindowResize = () => {
      windowHalfX = window.innerWidth / 2;
      windowHalfY = window.innerHeight / 2;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', onWindowResize);

    // Animation Loop
    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Slerp camera based on mouse
      targetX = mouseX * 0.05;
      targetY = mouseY * 0.05;

      particleSystem.rotation.y += 0.0008;
      particleSystem.rotation.x += 0.0004;

      scene.rotation.x += 0.02 * (targetY - scene.rotation.x);
      scene.rotation.y += 0.02 * (targetX - scene.rotation.y);

      // Dynamically create web
      const positions = particleSystem.geometry.attributes.position.array;
      const linePositions = [];

      for (let i = 0; i < particlesCount; i++) {
        positions[i * 3] += velocities[i].x;
        positions[i * 3 + 1] += velocities[i].y;
        positions[i * 3 + 2] += velocities[i].z;

        if (Math.abs(positions[i * 3]) > 1500) velocities[i].x *= -1;
        if (Math.abs(positions[i * 3 + 1]) > 1500) velocities[i].y *= -1;
        if (Math.abs(positions[i * 3 + 2]) > 1500) velocities[i].z *= -1;

        for (let j = i + 1; j < particlesCount; j++) {
          const dx = positions[i * 3] - positions[j * 3];
          const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
          const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
          const distSq = dx * dx + dy * dy + dz * dz;

          if (distSq < 45000) {
            linePositions.push(
              positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
              positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]
            );
          }
        }
      }

      particleSystem.geometry.attributes.position.needsUpdate = true;

      // Rebuild lines each frame
      const currentLines = scene.children.find(c => c.type === "LineSegments");
      if (currentLines) {
        scene.remove(currentLines);
        currentLines.geometry.dispose();
      }

      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
      const newLines = new THREE.LineSegments(lineGeometry, linesMaterial);
      scene.add(newLines);

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener('mousemove', onDocumentMouseMove);
      window.removeEventListener('resize', onWindowResize);
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div 
      ref={mountRef} 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        opacity: 0.6,
        pointerEvents: 'none' // Allows clicking through to interactive elements
      }}
    />
  );
}
