import React from 'react';

/**
 * 对垒表盘 brand mark — the same geometry as /favicon.svg (ring split
 * aff-blue / neg-red, white dial, navy hand) for inline use in app-bar
 * titles. Decorative by default: mark aria-hidden and keep the accessible
 * name on the adjacent title text.
 */
export default function BrandMark({ size = 22, style, ...props }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 512 512"
            aria-hidden="true"
            focusable="false"
            style={{ verticalAlign: 'middle', ...style }}
            {...props}
        >
            <path d="M 256 56 A 200 200 0 0 0 256 456" fill="none" stroke="#1976d2" strokeWidth="72" />
            <path d="M 256 56 A 200 200 0 0 1 256 456" fill="none" stroke="#c62828" strokeWidth="72" />
            <circle cx="256" cy="256" r="150" fill="#ffffff" />
            <line x1="256" y1="256" x2="334" y2="178" stroke="#1a237e" strokeWidth="28" strokeLinecap="round" />
            <circle cx="256" cy="256" r="24" fill="#1a237e" />
        </svg>
    );
}
