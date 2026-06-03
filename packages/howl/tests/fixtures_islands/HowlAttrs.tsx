import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export interface HowlAttrs {
  id?: string;
}

export function HowlAttrs(props: HowlAttrs) {
  const active = useSignal(false);
  useEffect(() => {
    active.value = true;
  }, []);

  return (
    <div id={props.id} class={active.value ? "ready" : ""}>
      <h1>Howl attrs</h1>
      <div class="client-nav-true" client-nav>client-nav=true</div>
      <div class="client-nav-false" client-nav={false}>
        client-nav=false
      </div>
    </div>
  );
}
