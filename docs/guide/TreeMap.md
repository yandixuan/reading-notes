# TreeMap

[参考](https://my.oschina.net/u/4364289/blog/4174438)

TreeMap 的实现是红黑树算法的实现

:::tip 红黑树特性

- 是一颗 BST
- 每个节点要么红的，要么是黑的
- 根节点是黑的，并且定义 NULL 为黑的
- 如果一个节点是红色的，那么它的俩儿子都是黑色的，并且父节点是黑色的
- 对于任一节点而言，它到叶节点的每条路径都包含相同数目的黑色节点，称为黑高

:::

```java
public class TreeMap<K,V>
    extends AbstractMap<K,V>
    implements NavigableMap<K,V>, Cloneable, java.io.Serializable{

    /**
     *  key排序比较器
     */
    private final Comparator<? super K> comparator;
    /**
    *   根节点
    */
    private transient Entry<K,V> root;
    /**
     * 树的元素数量
     * The number of entries in the tree
     */
    private transient int size = 0;
    /**
     * 当前树被修改次数
     * The number of structural modifications to the tree.
     */
    private transient int modCount = 0;
}
```

## 方法

### putAll

```java
    public void putAll(Map<? extends K, ? extends V> map) {
        // 获取map的元素大小
        int mapSize = map.size();
        // 如果 TreeMap 刚初始化（size==0） putAll元素大小也不为空 并且是 SortedMap的实现类才走下面逻辑
        // 否则就调用put 一个个慢慢插入节点
        if (size==0 && mapSize!=0 && map instanceof SortedMap) {
            // 获取map的比较器
            Comparator<?> c = ((SortedMap<?,?>)map).comparator();
            // 如果map的比较器与treeMap的比较器是相同的内存地址
            // 或者是map与treeMap的comparator相同(重写了equals方法)
            if (c == comparator || (c != null && c.equals(comparator))) {
                // 次数加1
                ++modCount;
                try {
                    buildFromSorted(mapSize, map.entrySet().iterator(),
                                    null, null);
                } catch (java.io.IOException cannotHappen) {
                } catch (ClassNotFoundException cannotHappen) {
                }
                return;
            }
        }
        // 实际调用 put方法
        super.putAll(map);
    }
```

### put

```java
    public V put(K key, V value) {
        Entry<K,V> t = root;
        // 如果根节点为空
        if (t == null) {
            // 判断比较器可用或者key自身是可以比较的（实现Comparable）
            compare(key, key); // type (and possibly null) check
            // 创建根节点
            root = new Entry<>(key, value, null);
            // size赋值
            size = 1;
            // 修改次数递增，然后返回null
            modCount++;
            return null;
        }
        int cmp;
        Entry<K,V> parent;
        // split comparator and comparable paths
        // 获取比较器
        Comparator<? super K> cpr = comparator;
        // 如果比较器不为空
        if (cpr != null) {
            // 循环找节点，当t为空的时候结束循环
            do {
                parent = t;
                cmp = cpr.compare(key, t.key);
                if (cmp < 0)
                    t = t.left;
                else if (cmp > 0)
                    t = t.right;
                else
                    // 找到了新值覆盖旧值并且返回旧值
                    return t.setValue(value);
            } while (t != null);
        }
        else {
            // 如果比较器为空，那么key不能空否则空指针异常
            if (key == null)
                throw new NullPointerException();
            // 类型强转
            @SuppressWarnings("unchecked")
                Comparable<? super K> k = (Comparable<? super K>) key;
            // 分析同比较器一样
            do {
                parent = t;
                cmp = k.compareTo(t.key);
                if (cmp < 0)
                    t = t.left;
                else if (cmp > 0)
                    t = t.right;
                else
                    return t.setValue(value);
            } while (t != null);
        }
        // 新建Entry对象e
        Entry<K,V> e = new Entry<>(key, value, parent);
        if (cmp < 0)
            parent.left = e;
        else
            parent.right = e;
        // 插入修正
        fixAfterInsertion(e);
        size++;
        modCount++;
        return null;
    }
```

### buildFromSorted

```java
    /**
    *   根据有序数据建造红黑树
    */
    private void buildFromSorted(int size, Iterator<?> it,
                                 java.io.ObjectInputStream str,
                                 V defaultVal)
        throws  java.io.IOException, ClassNotFoundException {
        this.size = size;
        // 建造树 参数解析
        // level起始层级 0
        // 0 有序数据索引起始 0
        // size-1 有序数据索引结束 size-1
        // computeRedLevel(size) 红色节点层级
        // 有序数据集合
        // str 序列化相关 ObjectInputStream
        // defaultVal 默认值
         数据索引区间 [0,size-1]，computeRedLevel(size)红色节点
        root = buildFromSorted(0, 0, size-1, computeRedLevel(size),
                               it, str, defaultVal);
    }

    private final Entry<K,V> buildFromSorted(int level, int lo, int hi,
                                             int redLevel,
                                             Iterator<?> it,
                                             java.io.ObjectInputStream str,
                                             V defaultVal)
        throws  java.io.IOException, ClassNotFoundException {
        /*
         * Strategy: The root is the middlemost element. To get to it, we
         * have to first recursively construct the entire left subtree,
         * so as to grab all of its elements. We can then proceed with right
         * subtree.
         *
         * The lo and hi arguments are the minimum and maximum
         * indices to pull out of the iterator or stream for current subtree.
         * They are not actually indexed, we just proceed sequentially,
         * ensuring that items are extracted in corresponding order.
         */
        // 如果hi<lo返回空 参数不正确
        if (hi < lo) return null;
        // (index+end)/2取中位数
        int mid = (lo + hi) >>> 1;
        // 左子树
        Entry<K,V> left  = null;

        // 如果 lo < mid 就递归造第二层左子树 左子树递归完左子树 读取一次iterator 便是字节点的父节点 接着递归造右子树
        // level+1:下一层，mid - 1就是下层左子树索引的结束位置
        // 如果 mid==lo 说明左子树不能再造了 比如：7 8 9中位数就是 8 下次 buildFromSorted lo=7 mid=7 buildLeft结束
        if (lo < mid)
            left = buildFromSorted(level+1, lo, mid - 1, redLevel,
                                   it, str, defaultVal);

        // extract key and/or value from iterator or stream
        K key;
        V value;
        // 如果迭代器不为空
        if (it != null) {
            // 如果参数传来的默认值为空，那么默认从迭代器去取元素
            if (defaultVal==null) {
                // 获取key，value
                Map.Entry<?,?> entry = (Map.Entry<?,?>)it.next();
                key = (K)entry.getKey();
                value = (V)entry.getValue();
            } else {
                // defaultVal不为空就使用defaultVal
                key = (K)it.next();
                value = defaultVal;
            }
        } else { // use stream
            // 如果迭代器为空，那么就使用 java.io.ObjectInputStream读取后为默认值
            key = (K) str.readObject();
            value = (defaultVal != null ? defaultVal : (V) str.readObject());
        }
        // 刚才获取的 k,v 为子节点 或者 同时拥有左右子树 递归形式去获取
        Entry<K,V> middle =  new Entry<>(key, value, null);

        // color nodes in non-full bottommost level red
        // Map.Entry<K,V>默认是黑色 如果level 递增到了 redLevel便把节点设置成红色
        if (level == redLevel)
            middle.color = RED;
        // 如果左节点不为空 middle，left 互相关联
        if (left != null) {
            middle.left = left;
            left.parent = middle;
        }

        // 如果mid <hi递归造右子树 直到 mide==hi
        if (mid < hi) {
            Entry<K,V> right = buildFromSorted(level+1, mid+1, hi, redLevel,
                                               it, str, defaultVal);
            // middle，right互相关联
            middle.right = right;
            right.parent = middle;
        }
        // 递归完成后整个红黑树就造完，使用了二分法，递归 O(log2N)
        return middle;
    }
```

### computeRedLevel

它的作用是用来计算完全二叉树红色节点的层数，在构造红黑树的时候，我们只需要最后一层设置成红色，其他层数全是黑色节点便满足红黑树特性。

计算红色节点应该在红黑树哪一层,因为二叉树，因为每层二叉树要填满的话必须是 2 的倍数

每层数据叠加是 1,1+2,1+2+4,1+2+4+8... 基本就是每层就是每层/2

```java
    private static int computeRedLevel(int sz) {
        int level = 0;
        // 从0开始计算满二叉树最后一个元素索引位置为0,2,6,14...
        // 可以看出m=(m+1)*2 前一个和后一个的递推关系 每一层计算
        // 那么反过来就是m/2-1就是上一层的位置，最后一个m>=0的时候还要计算一次
        for (int m = sz - 1; m >= 0; m = m / 2 - 1)
            level++;
        return level;
    }
```

### deleteEntry

```java

    private void deleteEntry(Entry<K,V> p) {
        // 这里先 递增修改次数，元素数量递减
        modCount++;
        size--;

        // If strictly internal, copy successor's element to p and then make p
        // point to successor.

        // 如果p的左右子树都不为空
        if (p.left != null && p.right != null) {
            // 因为删除的节点存在左右子树，那么只有去寻找p的后继节点，替换上来才行
            Entry<K,V> s = successor(p);
            // 将后继节点的值转给P值
            // 读到这里我有疑惑了 look at https://blog.csdn.net/IdealSpring/article/details/83780609
            p.key = s.key;
            p.value = s.value;
            // 既然s的值已经转给p 那么原本的S后继节点便是我们需要删除的节点，所以将p变量指向的对象改成s，删除就行了
            p = s;
        } // p has 2 children

        // Start fixup at replacement node, if it exists.
        // 因为p已经指向了后继节点 那么后继节点可能是右子树的最做子树 也可能是父节点并且是左子树的情况
        // 那么如果要删除这个节点 得找到替换节点 优先考虑左子树再是右子树
        Entry<K,V> replacement = (p.left != null ? p.left : p.right);
        // 如果replacement存在
        if (replacement != null) {
            // Link replacement to parent
            // replacement与p的父节点关联
            replacement.parent = p.parent;
            // 如果p是根节点
            if (p.parent == null)
                // 设置replacement节点为根节点
                root = replacement;
            else if (p == p.parent.left)
                // 如果 p是左子树
                // p的父节点的左子树是replacement
                p.parent.left  = replacement;
            else
                // 如果 p是右子树
                // p的父节点的右子树是replacement
                p.parent.right = replacement;

            // Null out links so they are OK to use by fixAfterDeletion.
            // 将p的关联字段全部清空 gc
            p.left = p.right = p.parent = null;

            // Fix replacement
            // 这里我们可以看成 r与p值互换了 我们删除的是replacement 所以我们修正的也是replacement节点
            if (p.color == BLACK)
                fixAfterDeletion(replacement);
        } else if (p.parent == null) { // return if we are the only node.
            // 如果p是根节点
            // root置空
            root = null;
        } else { //  No children. Use self as phantom replacement and unlink.
            // 如果p没有子节点
            if (p.color == BLACK)
                // 如果p的颜色是黑色节点，那么破坏黑高了，要修复
                fixAfterDeletion(p);
            // 移除p节点
            if (p.parent != null) {
                if (p == p.parent.left)
                    p.parent.left = null;
                else if (p == p.parent.right)
                    p.parent.right = null;
                p.parent = null;
            }
        }
    }
```

### getEntry

根据 key 找到 entry

```java
    final Entry<K,V> getEntry(Object key) {
        // Offload comparator-based version for sake of performance
        // 如果comparator不为空
        if (comparator != null)
            return getEntryUsingComparator(key);
        // 如果key为null 报空指针 所以TreeMap不能put Null
        if (key == null)
            throw new NullPointerException();
        // key 基本数据类型包装累 String，Integer....基本都是实现了Comparable
        @SuppressWarnings("unchecked")
            Comparable<? super K> k = (Comparable<? super K>) key;
        Entry<K,V> p = root;
        // 遍历整个红黑树找节点
        while (p != null) {
            int cmp = k.compareTo(p.key);
            if (cmp < 0)
                p = p.left;
            else if (cmp > 0)
                p = p.right;
            else
                return p;
        }
        // 没找到返回Null
        return null;
    }

    /**
    *   使用比较器获取Entry
    */
    final Entry<K,V> getEntryUsingComparator(Object key) {
        // 强转key
        @SuppressWarnings("unchecked")
            K k = (K) key;
        // 获取比较器
        Comparator<? super K> cpr = comparator;
        if (cpr != null) {
            Entry<K,V> p = root;
            // 遍历整个红黑树找节点
            while (p != null) {
                // 通过比较key
                int cmp = cpr.compare(k, p.key);
                // 找左子树
                if (cmp < 0)
                    p = p.left;
                // 找右子树
                else if (cmp > 0)
                    p = p.right;
                else
                // 相等便返回Entry
                    return p;
            }
        }
        return null;
    }
```

### getFirstEntry

默认升序排序，取最小的值，递归取左子树

```java
    final Entry<K,V> getFirstEntry() {
        Entry<K,V> p = root;
        if (p != null)
            while (p.left != null)
                p = p.left;
        return p;
    }
```

### getLastEntry

默认升序排序，取最大的值，递归取右子树

```java
    final Entry<K,V> getLastEntry() {
        Entry<K,V> p = root;
        if (p != null)
            while (p.right != null)
                p = p.right;
        return p;
    }
```

### successor

二叉树后继节点，中序遍历的后一个节点

- 如果节点有右子树，则该节点的后继节点就是往右子树出发，然后转到右子树的左子树，一直到左子树的左子树为空
- 如果节点没有右子树，则向上寻找父节点，直到父节点的左子树等于当前节点，则该父节点就是后继节点

```java
    static <K,V> TreeMap.Entry<K,V> successor(Entry<K,V> t) {
        // 如果节点为null，返回null
        if (t == null)
            return null;
        // 如果节点的右子树不为null
        else if (t.right != null) {
            Entry<K,V> p = t.right;
            while (p.left != null)
                p = p.left;
            return p;
        } else {
            // 如果节点没有右子树
            // 当前节点的父节点
            Entry<K,V> p = t.parent;
            // 当前节点
            Entry<K,V> ch = t;
            // 一直向上找直到 节点当它的父节点的左子树结束循环
            while (p != null && ch == p.right) {
                ch = p;
                p = p.parent;
            }
            return p;
        }
    }
```

## 树的辅助操作

封装一下树的基本操作

```java
    /**
    *   判断节点颜色
    *   默认null节点为黑色，否则为红色节点
    */
    private static <K,V> boolean colorOf(Entry<K,V> p) {
        return (p == null ? BLACK : p.color);
    }
    /**
    *   获取节点的父节点
    *   如果节点为null返回null，否则返回节点的父节点
    */
    private static <K,V> Entry<K,V> parentOf(Entry<K,V> p) {
        return (p == null ? null: p.parent);
    }

    /**
    *   如果节点不为null，设置节点颜色
    */
    private static <K,V> void setColor(Entry<K,V> p, boolean c) {
        if (p != null)
            p.color = c;
    }
    /**
    *   返回左子树，如果节点为null，返回null
    */
    private static <K,V> Entry<K,V> leftOf(Entry<K,V> p) {
        return (p == null) ? null: p.left;
    }

    /**
    *   返回右子树，如果节点为null，返回null
    */
    private static <K,V> Entry<K,V> rightOf(Entry<K,V> p) {
        return (p == null) ? null: p.right;
    }

```

### fixAfterInsertion（插入修正）

```java
    private void fixAfterInsertion(Entry<K,V> x) {
        // 默认插入红色节点，这样不会破坏黑高，修正起来最方便
        x.color = RED;
        // 循环修正节点 当x不为空 并且 x不为根节点 并且 x的父节点为红节点 只要任意不满足即退出循环
        // 只要 x节点的父节点为黑色那么 那么直接满足红黑树特性直接over
        // 只要父亲节点的颜色是红色就不满足红黑树特性，需要调整
        while (x != null && x != root && x.parent.color == RED) {
            // 这里为了方便辨识，节点p=parentOf(x)；节点g=parentOf(parentOf(x))。
            // 这里有个隐含条件 x,p为红色节点，g为黑色节点
            if (parentOf(x) == leftOf(parentOf(parentOf(x)))) {
                // p是g的左子树
                // y是p的兄弟节点
                Entry<K,V> y = rightOf(parentOf(parentOf(x)));
                if (colorOf(y) == RED) {
                    // 如果y是红色节点
                    // 那么我们只需要将y,p节点染红；g节点染红
                    // 这里子树已经平衡了，但是g节点为红色可能不满足红黑树特效了那么指针x回溯至g节点继续向上循环
                    setColor(parentOf(x), BLACK);
                    setColor(y, BLACK);
                    setColor(parentOf(parentOf(x)), RED);
                    x = parentOf(parentOf(x));
                } else {
                    // 如果y节点是黑色节点（这里y是Null节点），如果不是则违背了红黑树性质

                    if (x == rightOf(parentOf(x))) {
                        // 如果 x是p的右子树，需要左旋一次p节点，将节点调成一条线
                        // x指针回溯至p节点，左旋p节点，之后p节点就是最下面的节点了
                        x = parentOf(x);
                        rotateLeft(x);
                    }
                    // 将p节点染黑，g节点染红，右旋g节点
                    // x成为根节点黑色，p,g为左右子树红色节点，没有改黑高满足性质
                    setColor(parentOf(x), BLACK);
                    setColor(parentOf(parentOf(x)), RED);
                    rotateRight(parentOf(parentOf(x)));
                    // x节点红色，父节点黑色直接over了
                }
            } else {
                // p是g的右子树
                // 前排判断了，所以直接找g的左子树y
                Entry<K,V> y = leftOf(parentOf(parentOf(x)));

                if (colorOf(y) == RED) {
                     // 如果y是红色节点
                     // 根上面一样，将y,p节点染黑，g节点染红，指针回溯至g点继续循环修正节点
                    setColor(parentOf(x), BLACK);
                    setColor(y, BLACK);
                    setColor(parentOf(parentOf(x)), RED);
                    x = parentOf(parentOf(x));
                } else {
                    // 这里跟上面一样，隐含条件y树null节点
                    // 如果x是p的左子树
                    if (x == leftOf(parentOf(x))) {
                        // x指针回溯至p点，右旋p节点，那么p节点变成最下层节点（也就是x）
                        x = parentOf(x);
                        rotateRight(x);
                    }
                    // 将p节点染黑，g，y节点染红，然后左旋g节点，子树黑高不变，满足红黑树特效
                    setColor(parentOf(x), BLACK);
                    setColor(parentOf(parentOf(x)), RED);
                    rotateLeft(parentOf(parentOf(x)));
                    // x节点红色，父节点黑色直接over了
                }
            }
        }
        // 有可能x是根节点，把根节点染黑
        root.color = BLACK;
    }
```

### fixAfterDeletion（删除修正）

```java

    private void fixAfterDeletion(Entry<K,V> x) {

        while (x != root && colorOf(x) == BLACK) {
            if (x == leftOf(parentOf(x))) {
                Entry<K,V> sib = rightOf(parentOf(x));

                if (colorOf(sib) == RED) {
                    setColor(sib, BLACK);
                    setColor(parentOf(x), RED);
                    rotateLeft(parentOf(x));
                    sib = rightOf(parentOf(x));
                }

                if (colorOf(leftOf(sib))  == BLACK &&
                    colorOf(rightOf(sib)) == BLACK) {
                    setColor(sib, RED);
                    x = parentOf(x);
                } else {
                    if (colorOf(rightOf(sib)) == BLACK) {
                        setColor(leftOf(sib), BLACK);
                        setColor(sib, RED);
                        rotateRight(sib);
                        sib = rightOf(parentOf(x));
                    }
                    setColor(sib, colorOf(parentOf(x)));
                    setColor(parentOf(x), BLACK);
                    setColor(rightOf(sib), BLACK);
                    rotateLeft(parentOf(x));
                    x = root;
                }
            } else { // symmetric
                Entry<K,V> sib = leftOf(parentOf(x));

                if (colorOf(sib) == RED) {
                    setColor(sib, BLACK);
                    setColor(parentOf(x), RED);
                    rotateRight(parentOf(x));
                    sib = leftOf(parentOf(x));
                }

                if (colorOf(rightOf(sib)) == BLACK &&
                    colorOf(leftOf(sib)) == BLACK) {
                    setColor(sib, RED);
                    x = parentOf(x);
                } else {
                    if (colorOf(leftOf(sib)) == BLACK) {
                        setColor(rightOf(sib), BLACK);
                        setColor(sib, RED);
                        rotateLeft(sib);
                        sib = leftOf(parentOf(x));
                    }
                    setColor(sib, colorOf(parentOf(x)));
                    setColor(parentOf(x), BLACK);
                    setColor(leftOf(sib), BLACK);
                    rotateRight(parentOf(x));
                    x = root;
                }
            }
        }

        setColor(x, BLACK);
    }

```

### rotateLeft（左旋节点）

左旋 p 节点(以 P 的右轴进行逆时针旋转)

          p                                         r
       /    \              左旋转                 /    \
      T1     r           --------->             p      T3
           /   \                              /   \
         T2     T3                           T1   T2

```java

    private void rotateLeft(Entry<K,V> p) {
        // 前提节点不能是null
        if (p != null) {
            // 获取右子树
            Entry<K,V> r = p.right;
            // p的右子树 变为 r 的左子树
            p.right = r.left;
            // 如果r的左子树不为空
            if (r.left != null)
                // 将r与p进行连接
                r.left.parent = p;
            // 因为 r 要变成 p 的父节点
            r.parent = p.parent;
            // 如果p是根节点
            if (p.parent == null)
                // 直接将r设置成根节点
                root = r;
            // 如果p是左子树
            else if (p.parent.left == p)
                // 将左子树设置成r
                p.parent.left = r;
            else
                // 否则设置成右子树
                p.parent.right = r;
            // r的左子树设置p节点
            r.left = p;
            // 将p与r父子关系连接
            p.parent = r;
        }
    }
```

### rotateRight（右旋节点）

                 p                                       L
              /    \              右旋转                /    \
             L     T2           --------->            T3      p
           /  \                                             /   \
          T3   T1                                           T1   T2

如上图所示右旋 p 节点(以 P 的左轴进行顺时针旋转)

```java
    private void rotateRight(Entry<K,V> p) {
        // 节点不为null
        if (p != null) {
            // 获取p的左子树
            Entry<K,V> l = p.left;
            // 右旋之后，p的左边就是L的右边
            p.left = l.right;
            // 如果L的右子树不为null那么 L的右子树的父节点为P
            if (l.right != null) l.right.parent = p;
            // L的父节点变成P的父节点 因为L现在成为子树的根节点
            l.parent = p.parent;
            // 如果p的父节点是null
            if (p.parent == null)
                // 将L设置成根节点
                root = l;
            // 如果p是右子树
            else if (p.parent.right == p)
                // p父节点的右子树是L
                p.parent.right = l;
            // 否则p父节点的左子树是L
            else p.parent.left = l;
            // 关联关系 L的右子树是P P的父节点是L
            l.right = p;
            p.parent = l;
        }
    }
```
