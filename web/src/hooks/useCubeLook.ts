import { useEffect, useState } from "react";
import { getCubeSummary } from "../api/client";

/** A cube's name and art. The name is blank until it's known. */
export interface CubeLook {
  name: string;
  imageUri: string | null;
}

const NOT_KNOWN_YET: CubeLook = { name: "", imageUri: null };

/** How the cube or deck with this CubeCobra ID looks, named by its ID when it can't be looked up. */
export function useCubeLook(cubeId: string | null): CubeLook | null {
  const [found, setFound] = useState<{ cubeId: string; look: CubeLook } | null>(
    null,
  );

  useEffect(() => {
    if (!cubeId) return;
    let cancelled = false;
    const show = (name: string | null, imageUri: string | null) => {
      if (!cancelled)
        setFound({ cubeId, look: { name: name ?? cubeId, imageUri } });
    };
    getCubeSummary(cubeId).then(
      (cube) => show(cube.cube_name, cube.cube_image_uri),
      () => show(null, null),
    );
    return () => {
      cancelled = true;
    };
  }, [cubeId]);

  if (!cubeId) return null;
  return found?.cubeId === cubeId ? found.look : NOT_KNOWN_YET;
}
