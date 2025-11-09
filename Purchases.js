const expres = require('express')
const router = express.Router()
const pool = require('./connection')

function Validaciondatalles(details) {
  if(!Array.isArray(details)) return 'details debe ser un arreglo'
  if(details.length < 1) return 'Debe haber al menos un producto en la compra'
  if(details.length > 5) return 'No se pueden guardar mas de 5 productos por compra'
  for(const d of details){
    if(!d.product_id || !Number.isInteger(d.quantity) || d.quantity <= 0) return 'Detalle inválido: product_id y quantity (>0) son obligatorios'
    if(d.price == null || isNaN(Number(d.price)) || Number(d.price) < 0) return 'Detalle inválido: price debe ser numérico >= 0'
  }
  return null
}

function R2(n){
  return Math.round(Number(n) * 100) / 100
}

function AgregarDetallesProduct(details){

  const map = new Map()
  for(const d of details){
    const pid = d.product_id
    const qty = Number(d.quantity)
    const price = Number(d.price)
    if(map.has(pid)){
      const cur = map.get(pid)
      if(cur.price !== price) throw { status:400, message: `Precio inconsistente para product_id ${pid}` }
      cur.quantity += qty
      map.set(pid, cur)
    }else{
      map.set(pid, { quantity: qty, price })
    }
  }
  return map
}

async function AdecuacionPurchases(conn, purchaseId){
  const [rows] = await conn.query(
    `SELECT
      p.id as purchase_id, p.user_id, p.total, p.status, p.purchase_date, p.updated_at,
      u.name as user_name,
      d.id as detail_id, d.product_id, d.quantity, d.price, d.subtotal,
      pr.name as product_name
    FROM purchases p
    JOIN users u ON u.id = p.user_id
    JOIN purchase_details d ON d.purchase_id = p.id
    JOIN products pr ON pr.id = d.product_id
    WHERE p.id = ?
    ORDER BY d.id`,
    [purchaseId]
  )
  return rows
}

function Purchase(rows){
  if(rows.length===0) return null
  const first = rows[0]
  const compra = {
    id: first.purchase_id,
    usuario_id: first.user_id,
    usuario: first.user_name || null,
    total: Number(first.total),
    estado: first.status,
    fecha_compra: first.purchase_date,
    actualizado_en: first.updated_at,
    detalles: []
  }
  for(const r of rows){
    compra.detalles.push({
      id: r.detail_id,
      producto_id: r.product_id,
      producto: r.product_name,
      cantidad: r.quantity,
      precio: Number(r.price),
      subtotal: Number(r.subtotal)
    })
  }
  return compra
}

