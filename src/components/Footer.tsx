export default function Footer() {
  return (
    <footer className="border-line text-fg-3 mt-16 border-t pt-6 text-xs leading-relaxed">
      <p>
        Powered by{' '}
        <a
          href="https://www.sarvam.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-fg-2 hover:text-fg underline decoration-[#333] underline-offset-4"
        >
          Sarvam
        </a>{' '}
        · Bulbul v4 Flash · Saaras v4 · Sarvam-105B · Translate
      </p>
      <p className="mt-1">Hosts and stories are AI-generated. Headlines via Google News.</p>
    </footer>
  );
}
