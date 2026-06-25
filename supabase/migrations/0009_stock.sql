create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity numeric not null default 0,
  unit text not null default 'UN',
  category text not null,
  min_stock numeric,
  notes text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists idx_stock_items_name on stock_items(name);

-- AROMAS (KG)
insert into stock_items (name, quantity, unit, category) values
  ('CHOCOLATE', 0, 'KG', 'aroma'),
  ('LEITINHO', 45, 'KG', 'aroma'),
  ('DOCE DE LEITE', 90, 'KG', 'aroma'),
  ('BAUNILHA', 140, 'KG', 'aroma'),
  ('LIMÃO', 30, 'KG', 'aroma'),
  ('UVA', 33, 'KG', 'aroma'),
  ('MORANGO', 80, 'KG', 'aroma'),
  ('AÇAÍ', 160, 'KG', 'aroma'),
  ('MARACUJÁ', 160, 'KG', 'aroma'),
  ('CHOCOLATE MALTADO', 150, 'KG', 'aroma'),
  ('ABACAXI', 20, 'KG', 'aroma'),
  ('CAFÉ SOLÚVEL EXX', 25, 'KG', 'aroma'),
  ('DOCE DE LEITE EXX', 7.5, 'KG', 'aroma'),
  ('MORANGO EXX', 24, 'KG', 'aroma')
on conflict (name) do nothing;

-- MATÉRIA-PRIMA (KG)
insert into stock_items (name, quantity, unit, category) values
  ('GLICINA', 775, 'KG', 'materia_prima'),
  ('TAURINA', 925, 'KG', 'materia_prima'),
  ('WPC 80', 70, 'KG', 'materia_prima'),
  ('WPC 34', 4205, 'KG', 'materia_prima'),
  ('WPC 60 EXX', 10, 'KG', 'materia_prima'),
  ('COLÁGENO', 740, 'KG', 'materia_prima'),
  ('ALBUMINA', 3940, 'KG', 'materia_prima'),
  ('POLIDEXTROSE', 2125, 'KG', 'materia_prima'),
  ('LEITE EM PÓ', 0, 'KG', 'materia_prima'),
  ('CREATINA MP', 2500, 'KG', 'materia_prima'),
  ('DARK UVA', 100, 'KG', 'materia_prima'),
  ('DARK RED', 75, 'KG', 'materia_prima'),
  ('DARK LIMÃO', 0, 'KG', 'materia_prima'),
  ('SUCRALOSE', 25, 'KG', 'materia_prima'),
  ('EMULS 511', 140, 'KG', 'materia_prima'),
  ('ÁCIDO CÍTRICO', 25, 'KG', 'materia_prima'),
  ('LECITINA DE SOJA', 110, 'KG', 'materia_prima'),
  ('ARGININA', 1000, 'KG', 'materia_prima'),
  ('ERVA', 130, 'KG', 'materia_prima'),
  ('CMC', 50, 'KG', 'materia_prima'),
  ('DIÓXIDO', 225, 'KG', 'materia_prima'),
  ('MALTO', 2300, 'KG', 'materia_prima'),
  ('CREAMY FEEL', 0, 'KG', 'materia_prima'),
  ('TFT BLOCK', 0, 'KG', 'materia_prima'),
  ('CACAU', 50, 'KG', 'materia_prima')
on conflict (name) do nothing;

-- PRODUTO LAB SKULL (UN)
insert into stock_items (name, quantity, unit, category) values
  ('REFIL LAB SKULL 420G MORANGO', 800, 'UN', 'produto_lab'),
  ('REFIL LAB SKULL 420G CHOCOLATE', 890, 'UN', 'produto_lab'),
  ('REFIL LAB SKULL 420G COOKIES', 950, 'UN', 'produto_lab'),
  ('REFIL LAB SKULL 420G LEITINHO', 1380, 'UN', 'produto_lab'),
  ('REFIL LAB SKULL 420G DOCE DE LEITE', 1720, 'UN', 'produto_lab'),
  ('REFIL LAB SKULL 900G COOKIES', 1300, 'UN', 'produto_lab'),
  ('REFIL LAB SKULL 900G CHOCOLATE', 1630, 'UN', 'produto_lab'),
  ('REFIL LAB SKULL 900G DOCE DE LEITE', 1800, 'UN', 'produto_lab'),
  ('REFIL LAB SKULL 900G LEITINHO', 600, 'UN', 'produto_lab'),
  ('REFIL LAB SKULL 900G MORANGO', 650, 'UN', 'produto_lab'),
  ('REFIL PRE TREINO LAB 150G RED', 2400, 'UN', 'produto_lab'),
  ('REFIL PRE TREINO LAB 150G UVA', 2000, 'UN', 'produto_lab'),
  ('REFIL PRE TREINO LAB 150G LIMAO', 2400, 'UN', 'produto_lab'),
  ('REFIL PRE TREINO LAB 420G MORANGO', 2200, 'UN', 'produto_lab'),
  ('REFIL PRE TREINO LAB 420G UVA', 2045, 'UN', 'produto_lab'),
  ('REFIL PRE TREINO LAB 420G LIMAO', 2150, 'UN', 'produto_lab'),
  ('CREATINA LAB SKULL 420', 2050, 'UN', 'produto_lab')
on conflict (name) do nothing;

-- PRODUTO NYER (UN)
insert into stock_items (name, quantity, unit, category) values
  ('WHEY NYER REFIL 900g CHOCOLATE', 76, 'UN', 'produto_nyer'),
  ('WHEY NYER REFIL 900g MORANGO', 690, 'UN', 'produto_nyer'),
  ('WHEY NYER REFIL 900g LEITINHO', 389, 'UN', 'produto_nyer'),
  ('WHEY NYER REFIL 420g CHOCOLATE', 564, 'UN', 'produto_nyer'),
  ('WHEY NYER REFIL 420g MORANGO', 728, 'UN', 'produto_nyer'),
  ('WHEY NYER REFIL 420g LEITINHO', 900, 'UN', 'produto_nyer'),
  ('WHEY NYER REFIL 1Kg CHOCOLATE', 0, 'UN', 'produto_nyer'),
  ('WHEY NYER REFIL 1Kg MORANGO', 738, 'UN', 'produto_nyer'),
  ('WHEY NYER REFIL 1Kg DOCE DE LEITE', 330, 'UN', 'produto_nyer'),
  ('WHEY NYER REFIL 1Kg COOKIES', 336, 'UN', 'produto_nyer'),
  ('WHEY NYER REFIL 1Kg BAUNILHA', 504, 'UN', 'produto_nyer'),
  ('LEITINHO 1KG POTE', 651, 'UN', 'produto_nyer'),
  ('MORANGO 1KG POTE', 645, 'UN', 'produto_nyer'),
  ('CHOCOLATE 1KG POTE', 900, 'UN', 'produto_nyer'),
  ('MARACUJA 1KG POTE', 300, 'UN', 'produto_nyer'),
  ('AÇAÍ 1KG POTE', 555, 'UN', 'produto_nyer'),
  ('CHOCOLATE MALTADO 1KG POTE', 475, 'UN', 'produto_nyer'),
  ('PURE BUST LIMAO', 1, 'UN', 'produto_nyer'),
  ('PURE BUST RED', 506, 'UN', 'produto_nyer'),
  ('PURE BUST UVA', 240, 'UN', 'produto_nyer'),
  ('DARK PUMP LIMAO', 950, 'UN', 'produto_nyer'),
  ('DARK PUMP UVA', 140, 'UN', 'produto_nyer'),
  ('DARK PUMP RED', 85, 'UN', 'produto_nyer'),
  ('DIURETICO', 1650, 'UN', 'produto_nyer'),
  ('CREATINA 500 REFIL', 2025, 'UN', 'produto_nyer'),
  ('CREATINA 300 REFIL', 5450, 'UN', 'produto_nyer'),
  ('CREATINA 300 POTE', 60, 'UN', 'produto_nyer'),
  ('CREATINA 150 REFIL', 3460, 'UN', 'produto_nyer'),
  ('TERMOGENICO', 2450, 'UN', 'produto_nyer'),
  ('MULTIVITAMINICO', 2030, 'UN', 'produto_nyer'),
  ('HIDRO ORIGINAL 820', 640, 'UN', 'produto_nyer'),
  ('HIDRO MALTADO 820', 522, 'UN', 'produto_nyer'),
  ('HIDRO CHOCOLATE 820', 90, 'UN', 'produto_nyer'),
  ('HIDRO MORANGO 820', 630, 'UN', 'produto_nyer'),
  ('CREATINA SLEEVE', 522, 'UN', 'produto_nyer'),
  ('MAGNESIO', 264, 'UN', 'produto_nyer')
on conflict (name) do nothing;

-- EMBALAGEM (UN)
insert into stock_items (name, quantity, unit, category) values
  ('EMBALAGEM HIDRO MORANGO', 2100, 'UN', 'embalagem'),
  ('EMBALAGEM HIDRO CHOCOLATE', 2460, 'UN', 'embalagem'),
  ('EMBALAGEM HIDRO LEITINHO', 800, 'UN', 'embalagem'),
  ('EMBALAGEM HIDRO MALTADO', 2910, 'UN', 'embalagem'),
  ('REFIL 500G CREATINA', 5200, 'UN', 'embalagem'),
  ('REFIL 150G CREATINA', 8700, 'UN', 'embalagem'),
  ('REFIL 300G CREATINA', 10400, 'UN', 'embalagem'),
  ('REFIL CREATINA 500', 2580, 'UN', 'embalagem')
on conflict (name) do nothing;

-- RÓTULO/REFIL (UN)
insert into stock_items (name, quantity, unit, category) values
  ('ROTULO SLEEVE NYER AÇAÍ', 5499, 'UN', 'rotulo'),
  ('ROTULO SLEEVE NYER MALTADO', 4999, 'UN', 'rotulo'),
  ('ROTULO SLEEVE NYER LEITE', 5499, 'UN', 'rotulo'),
  ('ROTULO SLEEVE NYER MORANGO', 4999, 'UN', 'rotulo'),
  ('ROTULO SLEEVE NYER MARACUJÁ', 4999, 'UN', 'rotulo'),
  ('ROTULO SLEEVE NYER CHOCOLATE', 5349, 'UN', 'rotulo'),
  ('REFIL 900 NYER MORANGO', 2400, 'UN', 'rotulo'),
  ('REFIL 900 NYER LEITINHO', 3150, 'UN', 'rotulo'),
  ('REFIL 900 NYER CHOCOLATE', 3000, 'UN', 'rotulo'),
  ('REFIL 1KG NYER COOKIES', 2800, 'UN', 'rotulo'),
  ('REFIL 1KG NYER DOCE DE LEITE', 3450, 'UN', 'rotulo'),
  ('REFIL 1KG NYER CHOCOLATE', 3200, 'UN', 'rotulo'),
  ('REFIL 1KG NYER MORANGO', 4100, 'UN', 'rotulo'),
  ('REFIL 1KG NYER BAUNILHA', 2500, 'UN', 'rotulo'),
  ('REFIL 420 NYER ANTIGO LEITINHO', 600, 'UN', 'rotulo'),
  ('REFIL 900 NYER ANTIGO MORANGO', 1950, 'UN', 'rotulo'),
  ('REFIL 900 NYER ANTIGO LEITINHO', 400, 'UN', 'rotulo'),
  ('REFIL 900 NYER ANTIGO CHOCOLATE', 800, 'UN', 'rotulo')
on conflict (name) do nothing;
