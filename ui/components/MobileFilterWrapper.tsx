// ==============================
// MOBILE FILTER BUTTON + MODAL
// ==============================


'use client';
import { useState } from 'react';
import { FiFilter } from 'react-icons/fi';
import { useEffect } from 'react';


export default function MobileFilterWrapper({ children }: { children: React.ReactNode }) {
const [open, setOpen] = useState(false);

  const [isFilterOpen, setIsFilterOpen] = useState(false);

 // ✅ Prevent background scroll when mobile filter modal is open
useEffect(() => {
if (open) {
document.body.style.overflow = 'hidden';
document.body.style.position = 'fixed';
document.body.style.width = '100%';
} else {
document.body.style.overflow = '';
document.body.style.position = '';
document.body.style.width = '';
}


return () => {
document.body.style.overflow = '';
document.body.style.position = '';
document.body.style.width = '';
};
}, [open]);


return (
<>
{/* Mobile Filter Button */}
<div className="md:hidden mb-4">
<button
onClick={() => setOpen(true)}
className="flex items-center gap-2 px-4 py-2 rounded-full bg-black text-white shadow"
>
<FiFilter /> Filters
</button>
</div>


{/* Desktop Sidebar */}
<div className="hidden md:block">{children}</div>


{/* Mobile Modal */}
{open && (
<div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
<div className="bg-white w-full rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto">
<div className="flex justify-between items-center mb-4">
<h2 className="font-semibold text-lg">Filters</h2>
<button
onClick={() => setOpen(false)}
className="text-sm text-red-600"
>
Close
</button>
</div>


{children}
</div>
</div>
)}
</>
);
}