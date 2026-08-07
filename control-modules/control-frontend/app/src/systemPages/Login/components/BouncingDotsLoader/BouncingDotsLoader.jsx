// -----------------------------------------------------------
//  [*] BouncingDotsLoader — three bouncing white dots
//
//  Tiny inline wait indicator; the animation lives in the CSS
//  module next to this file (the 2nd and 3rd dot reuse the
//  first via `composes`, offset by animation-delay).
//
//  Used by:
//    - Login — inside the disabled LOGIN / REGISTER buttons
// -----------------------------------------------------------

import styles from './BouncingDotsLoader.module.css';


export default function BouncingDotsLoader() {
  return (
    <div className={styles.bouncingLoader}>
      <div className={styles.bouncingLoaderDiv}></div>
      <div className={styles.bouncingLoaderDiv2}></div>
      <div className={styles.bouncingLoaderDiv3}></div>
    </div>
  );
}
