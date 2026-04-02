export default function CarteLoading() {
  return (
    <div
      className="w-full flex items-center justify-center bg-muted/20 animate-pulse"
      style={{ height: "calc(100vh - 3.5rem)" }}
    >
      <span className="text-muted-foreground text-sm">Chargement de la carte...</span>
    </div>
  );
}
