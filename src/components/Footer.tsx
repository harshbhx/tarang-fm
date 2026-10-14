export default function Footer() {
  return (
    <footer className="border-line text-fg-3 mt-16 border-t pt-6 text-xs leading-relaxed lg:px-2">
      <p>
        Powered by{' '}
        <a
          href="https://www.sarvam.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          Sarvam
        </a>{' '}
        · Bulbul v4 Flash · Saaras v4 · Sarvam-105B · Translate
      </p>
      <p className="mt-1">Hosts and stories are AI-generated. Headlines via BBC, Bing News and Google News. Weather by Open-Meteo.</p>
    </footer>
  );
}
