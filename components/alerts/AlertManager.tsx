"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Trash2, Plus, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { LocationSearch } from "@/components/common/LocationSearch";
import { FEDERATIONS, DISCIPLINES } from "@/lib/constants";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import type { GeocodingResult } from "@/types";
import { displayRaceName } from "@/lib/race-name";

interface RuleMatch {
  raceId: string;
  name: string;
  raceDate: string;
  city: string | null;
  distanceKm: number | null;
}

interface Rule {
  id: string;
  label: string | null;
  isActive: boolean;
  federations: string[];
  disciplines: string[];
  categories: string[];
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  leadTimeDays: number;
  matches: RuleMatch[];
}

/** Only the categories a rider actually enters; staff licences are not filters. */
const SELECTABLE = CATEGORIES.filter(
  (c) =>
    c.group === "ffc" || c.group === "fsgt" || c.group === "youth" || c.group === "women"
);

function Pills({
  items,
  selected,
  onToggle,
}: {
  items: Array<{ value: string; label: string }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const active = selected.includes(item.value);
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onToggle(item.value)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:border-primary/50 hover:bg-muted"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function AlertManager() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [place, setPlace] = useState<GeocodingResult | null>(null);
  const [radiusKm, setRadiusKm] = useState(60);
  const [leadTimeDays, setLeadTimeDays] = useState(21);
  const [federations, setFederations] = useState<string[]>([]);
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { rules: Rule[] };
      setRules(data.rules);
    } catch {
      setError("Impossible de charger les alertes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || null,
          federations,
          disciplines,
          categories,
          lat: place?.lat ?? null,
          lng: place?.lng ?? null,
          radiusKm,
          leadTimeDays,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Création impossible");
      }
      setLabel("");
      setPlace(null);
      setFederations([]);
      setDisciplines([]);
      setCategories([]);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible");
    } finally {
      setCreating(false);
    }
  }

  async function setActive(id: string, isActive: boolean) {
    await fetch(`/api/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    await load();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
        <Loader2 className="size-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{error}</p>
      )}

      {rules.length === 0 && !showForm && (
        <div className="text-center py-10 border rounded-xl bg-card">
          <Bell className="size-8 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="font-medium mb-1">Aucune alerte</p>
          <p className="text-sm text-muted-foreground mb-4">
            Recevez un email dès qu’une course correspond à vos critères.
          </p>
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="size-4" />
            Créer une alerte
          </Button>
        </div>
      )}

      {rules.map((rule) => (
        <div key={rule.id} className="border rounded-xl p-4 bg-card">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">
                {rule.label ?? "Alerte sans nom"}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {rule.lat != null
                  ? `${rule.radiusKm} km autour du point choisi`
                  : "Toute la France"}
                {" · "}
                {rule.leadTimeDays} jours à l’avance
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setActive(rule.id, !rule.isActive)}
                title={rule.isActive ? "Suspendre" : "Réactiver"}
              >
                {rule.isActive ? (
                  <Bell className="size-4 text-primary" />
                ) : (
                  <BellOff className="size-4 text-muted-foreground" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(rule.id)}
                title="Supprimer"
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {rule.federations.map((f) => (
              <span key={f} className="text-[11px] px-1.5 py-0.5 rounded bg-muted uppercase">
                {f}
              </span>
            ))}
            {rule.categories.map((c) => (
              <span key={c} className="text-[11px] px-1.5 py-0.5 rounded bg-muted">
                {categoryLabel(c)}
              </span>
            ))}
          </div>

          {rule.matches.length > 0 ? (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {rule.matches.length} course{rule.matches.length > 1 ? "s" : ""} correspond
                {rule.matches.length > 1 ? "ent" : ""} actuellement
              </span>
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {rule.matches.slice(0, 3).map((m) => (
                  <li key={m.raceId} className="truncate">
                    {m.raceDate} — {displayRaceName(m.name)}
                    {m.distanceKm != null && ` · ${Math.round(m.distanceKm)} km`}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Aucune course ne correspond pour l’instant.
            </p>
          )}
        </div>
      ))}

      {rules.length > 0 && !showForm && (
        <Button
          variant="outline"
          onClick={() => setShowForm(true)}
          className="gap-2 self-start"
        >
          <Plus className="size-4" />
          Nouvelle alerte
        </Button>
      )}

      {showForm && (
        <div className="border rounded-xl p-4 bg-card flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nom
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Open 2 autour de chez moi"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Point de départ
            </label>
            <LocationSearch onSelect={setPlace} placeholder="Ville ou code postal…" />
            {place && (
              <>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="size-3" />
                  {place.label}
                </p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Rayon</span>
                  <span className="font-medium">{radiusKm} km</span>
                </div>
                <Slider
                  min={10}
                  max={300}
                  step={10}
                  value={[radiusKm]}
                  onValueChange={(v) =>
                    setRadiusKm(Array.isArray(v) ? (v as number[])[0] : (v as number))
                  }
                />
              </>
            )}
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fédération
            </label>
            <Pills
              items={FEDERATIONS.map((f) => ({ value: f.slug, label: f.name }))}
              selected={federations}
              onToggle={(v) => toggle(federations, setFederations, v)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Discipline
            </label>
            <Pills
              items={DISCIPLINES.map((d) => ({ value: d.value, label: d.label }))}
              selected={disciplines}
              onToggle={(v) => toggle(disciplines, setDisciplines, v)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Catégorie
            </label>
            <Pills
              items={SELECTABLE.map((c) => ({ value: c.value, label: c.label }))}
              selected={categories}
              onToggle={(v) => toggle(categories, setCategories, v)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold uppercase tracking-wider text-muted-foreground">
                Prévenir
              </label>
              <span className="font-medium">{leadTimeDays} jours à l’avance</span>
            </div>
            <Slider
              min={3}
              max={90}
              step={1}
              value={[leadTimeDays]}
              onValueChange={(v) =>
                setLeadTimeDays(Array.isArray(v) ? (v as number[])[0] : (v as number))
              }
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={create} disabled={creating} className="gap-2">
              {creating && <Loader2 className="size-4 animate-spin" />}
              Créer l’alerte
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
