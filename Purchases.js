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

// POST 
router.post('/api/Purchases', async (req, res) => {
  const { user_id, status, details } = req.body
  if(user_id == null || !status || details == null) return res.status(400).json({ error: 'Campos obligatorios: user_id, status, details' })

  const validationError = Validaciondatalles(details)
  if(validationError) return res.status(400).json({ error: validationError })

  let aggregated
  try{ aggregated = AgregarDetallesProduct(details) }catch(e){
    if(e && e.status) return res.status(e.status).json({ error: e.message })
    throw e
  }

  const total = R2(Array.from(details).reduce((s,d)=> s + (Number(d.quantity) * Number(d.price)), 0))
  if(total > 3500) return res.status(400).json({ error: 'El total de la compra no puede pasar $3500' })

  let conn
  try{
    conn = await pool.getConnection()
    await conn.beginTransaction()

    const [urows] = await conn.query('SELECT id FROM users WHERE id = ?', [user_id])
    if(urows.length === 0){ throw { status:400, message: 'user_id no existe' } }

    const productIds = Array.from(aggregated.keys()).map(Number).sort((a,b)=>a-b)
    if(productIds.length > 0){
      const placeholders = productIds.map(()=>'?').join(',')
      const [prodRows] = await conn.query(`SELECT id, stock FROM products WHERE id IN (${placeholders}) FOR UPDATE`, productIds)
      const stockById = Object.fromEntries(prodRows.map(r=>[r.id, r.stock]))

      for(const [pid, info] of aggregated.entries()){
        if(stockById[pid] == null) {
          throw { status:400, message: `Producto no existe: ${pid}` }
        }
        if(stockById[pid] < info.quantity) {
          throw { status:409, message: 'Stock insuficiente', product_id: pid }
        }
      }
    }

   
    const [pRes] = await conn.query('INSERT INTO purchases (user_id, total, status, purchase_date) VALUES (?, ?, ?, NOW())', [user_id, total, status])
    const purchaseId = pRes.insertId

   
    for(const d of details){
      const subtotal = R2(Number(d.quantity) * Number(d.price))
      await conn.query('INSERT INTO purchase_details (purchase_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)', [purchaseId, d.product_id, d.quantity, d.price, subtotal])
    }

    
    for(const [pid, info] of aggregated.entries()){
      await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [info.quantity, pid])
    }

    await conn.commit()
    res.status(201).json({ id: purchaseId })
  }catch(err){
    if(conn) await conn.rollback()
    if(err && err.status) return res.status(err.status).json({ error: err.message, product_id: err.product_id })
    console.error('/api/purchases POST error', err)
    res.status(500).json({ error: 'Error interno' })
  }finally{
    if(conn) conn.release()
  }
})



// PUT 
router.put('/api/purchases/:id', async (req, res) => {
  const purchaseId = Number(req.params.id)
  const { user_id, status, details } = req.body
  if(Number.isNaN(purchaseId)) return res.status(400).json({ error: 'id inválido' })

  const conn = await pool.getConnection()
  try{
    await conn.beginTransaction()

    const [pRows] = await conn.query('SELECT id, total, status FROM purchases WHERE id = ? FOR UPDATE', [purchaseId])
    if(pRows.length === 0){ await conn.rollback(); return res.status(404).json({ error: 'Compra no encontrada' }) }
    const existing = pRows[0]
    if(existing.status === 'COMPLETED'){ await conn.rollback(); return res.status(403).json({ error: 'No se puede modificar una compra COMPLETED' }) }

    let newTotal = existing.total

    if(details !== undefined){
      const vErr = validateDetailsArray(details)
      if(vErr){ await conn.rollback(); return res.status(400).json({ error: vErr }) }

      let newAgg
      try{ newAgg = aggregateDetails(details) }catch(e){ if(e && e.status){ await conn.rollback(); return res.status(e.status).json({ error: e.message }) } else throw e }

      newTotal = round2(Array.from(details).reduce((s,d)=> s + (Number(d.quantity) * Number(d.price)), 0))
      if(newTotal > 3500){ await conn.rollback(); return res.status(400).json({ error: 'El total de la compra no puede pasar $3500' }) }

      
      const [oldDetails] = await conn.query('SELECT product_id, quantity FROM purchase_details WHERE purchase_id = ?', [purchaseId])
      const oldMap = new Map()
      for(const od of oldDetails) oldMap.set(od.product_id, (oldMap.get(od.product_id)||0) + Number(od.quantity))


      const unionIds = Array.from(new Set([ ...oldMap.keys(), ...newAgg.keys() ])).map(Number).sort((a,b)=>a-b)
      if(unionIds.length>0){
        const placeholders = unionIds.map(()=>'?').join(',')
        const [prodRows] = await conn.query(`SELECT id, stock FROM products WHERE id IN (${placeholders}) FOR UPDATE`, unionIds)
        const stockById = Object.fromEntries(prodRows.map(r=>[r.id, r.stock]))

        for(const [pid, qty] of oldMap.entries()){
          if(stockById[pid] == null) throw { status:400, message: `Producto no existe: ${pid}` }
          stockById[pid] += qty
        }
        for(const [pid, info] of newAgg.entries()){
          if(stockById[pid] == null) throw { status:400, message: `Producto no existe: ${pid}` }
          if(stockById[pid] < info.quantity) throw { status:409, message: 'Stock insuficiente', product_id: pid }
        }

        for(const [pid, qty] of oldMap.entries()){
          await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [qty, pid])
        }
        await conn.query('DELETE FROM purchase_details WHERE purchase_id = ?', [purchaseId])
        for(const d of details){
          const subtotal = round2(Number(d.quantity) * Number(d.price))
          await conn.query('INSERT INTO purchase_details (purchase_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)', [purchaseId, d.product_id, d.quantity, d.price, subtotal])
        }
        for(const [pid, info] of newAgg.entries()){
          await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [info.quantity, pid])
        }
      }
    }

    const fields = []
    const values = []
    if(user_id != null){
      const [urows] = await conn.query('SELECT id FROM users WHERE id = ?', [user_id])
      if(urows.length === 0){ await conn.rollback(); return res.status(400).json({ error: 'user_id no existe' }) }
      fields.push('user_id = ?'); values.push(user_id)
    }
    if(status != null){ fields.push('status = ?'); values.push(status) }
    if(details !== undefined){ fields.push('total = ?'); values.push(newTotal); fields.push('updated_at = NOW()') }
    if(fields.length>0){
      const sql = `UPDATE purchases SET ${fields.join(', ')} WHERE id = ?`
      values.push(purchaseId)
      await conn.query(sql, values)
    }

    await conn.commit()
    res.json({ message: 'Actualizado' })
  }catch(err){
    await conn.rollback()
    if(err && err.status) return res.status(err.status).json({ error: err.message, product_id: err.product_id })
    console.error('/api/purchases PUT error', err)
    res.status(500).json({ error: 'Error interno' })
  }finally{
    conn.release()
  }
})