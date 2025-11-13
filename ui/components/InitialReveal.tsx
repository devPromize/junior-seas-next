"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function InitialReveal({ children }: { children: React.ReactNode }) {
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    // Run only once per refresh
    setHasAnimated(true);
  }, []);

  if (!hasAnimated) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    );
  }

  return <>{children}</>;
}
