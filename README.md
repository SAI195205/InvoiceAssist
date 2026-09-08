# InvoiceAssist Desktop 0.7.0

Aufbauend auf der technisch validierten 0.6.9/0.6.6-E-Rechnungsbasis.

Neu in 0.7.0:
- Kundenbereich mit persistenten Projekten/Bauvorhaben
- Rechnungen werden einem Projekt zugeordnet
- Abschlagsrechnungen können als bezahlt markiert werden
- Bei Schlussrechnungen werden passende bezahlte Abschlagsrechnungen des gleichen Kunden/Projekts vorgeschlagen und einzeln auswählbar angezeigt
- Bereits gezahlte Abschläge werden in Vorschau und ZUGFeRD-PDF ausgewiesen
- Für E-Rechnungen wird der vorausbezahlte Betrag als EN-16931 BT-113 (prepaidAmount) und der offene Zahlbetrag als BT-115 übergeben
- Einleitungstext-Baukasten: Architektur, Ingenieur, Architektur + Ingenieur oder eigener Text
- Freie Positionen und Stundenpositionen
- Bestehendes Logo-/Fußzeilenlayout bleibt erhalten

Noch nicht enthalten:
- echte HOAI-Honorarberechnung (bewusst für einen späteren eigenen Schritt vorgesehen)
- automatische Bankabstimmung/Zahlungserkennung

Hinweis: Vor Produktiveinsatz insbesondere Schlussrechnungen erneut mit den verwendeten E-Rechnungs-Validatoren prüfen.
